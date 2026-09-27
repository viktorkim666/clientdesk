import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";
const CLEAN_BILLING_PATH = `/w/${WORKSPACE_SLUG}/settings/billing`;

const {
  getCurrentWorkspaceMock,
  createClientMock,
  createAdminClientMock,
  getStripeMock,
  isBillingConfiguredMock,
  syncWorkspaceBillingMock,
  redirectMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getStripeMock: vi.fn(),
  isBillingConfiguredMock: vi.fn(() => true),
  syncWorkspaceBillingMock: vi.fn(() => Promise.resolve()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: getStripeMock,
  isBillingConfigured: isBillingConfiguredMock,
}));
vi.mock("@/lib/billing/sync", () => ({
  syncWorkspaceBilling: syncWorkspaceBillingMock,
  toSyncSupabaseClient: (client: unknown) => client,
}));

import BillingPage from "./page";

function workspace(role: "owner" | "member" | "client") {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: WORKSPACE_SLUG,
    role,
    clientId: null,
    userId: "00000001-0000-4000-8000-000000000001",
  };
}

/** A `supabase.from("workspace_billing")`/`.from("clients")` stub good
 * enough for the page's post-sync `Promise.all` read. */
function mainSupabase(options?: {
  billingRow?: {
    subscription_status: string | null;
    current_period_end: string | null;
    cancel_at: string | null;
  } | null;
}) {
  return {
    from: (table: string) => {
      if (table === "workspace_billing") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: options?.billingRow ?? null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      throw new Error(`from() was not stubbed for table "${table}"`);
    },
  };
}

/** The admin client's one query in the owner sync branch: a lookup for the
 * pending row's `stripe_customer_id`. */
function adminSupabase(options: {
  pendingRow?: { stripe_customer_id: string } | null;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: options.pendingRow ?? null, error: null }),
        }),
      }),
    }),
  };
}

function stripeFake() {
  return { fake: "stripe-client" };
}

beforeEach(() => {
  vi.clearAllMocks();
  isBillingConfiguredMock.mockReturnValue(true);
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  createClientMock.mockResolvedValue(mainSupabase());
  syncWorkspaceBillingMock.mockResolvedValue(undefined);
});

describe("BillingPage", () => {
  it("redirects to the clean billing path after syncing for the owner with ?checkout=success", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    getStripeMock.mockReturnValue(stripeFake());
    createAdminClientMock.mockReturnValue(
      adminSupabase({ pendingRow: { stripe_customer_id: "cus_test_123" } }),
    );

    await expect(
      BillingPage({
        params: Promise.resolve({ slug: WORKSPACE_SLUG }),
        searchParams: Promise.resolve({ checkout: "success" }),
      }),
    ).rejects.toThrow(`NEXT_REDIRECT:${CLEAN_BILLING_PATH}`);

    expect(syncWorkspaceBillingMock).toHaveBeenCalledWith(
      "cus_test_123",
      expect.anything(),
    );
    expect(redirectMock).toHaveBeenCalledWith(CLEAN_BILLING_PATH);
  });

  it("still redirects to the clean path when the post-checkout sync fails, logging the failure", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    getStripeMock.mockReturnValue(stripeFake());
    createAdminClientMock.mockReturnValue(
      adminSupabase({ pendingRow: { stripe_customer_id: "cus_test_123" } }),
    );
    syncWorkspaceBillingMock.mockRejectedValueOnce(new Error("Stripe is down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      BillingPage({
        params: Promise.resolve({ slug: WORKSPACE_SLUG }),
        searchParams: Promise.resolve({ checkout: "success" }),
      }),
    ).rejects.toThrow(`NEXT_REDIRECT:${CLEAN_BILLING_PATH}`);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(CLEAN_BILLING_PATH);
    consoleErrorSpy.mockRestore();
  });

  it("does not sync or redirect for a member with ?checkout=success, and renders normally", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("member"));

    const result = await BillingPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
      searchParams: Promise.resolve({ checkout: "success" }),
    });

    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("does not sync or redirect for the owner without ?checkout=success", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));

    const result = await BillingPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
      searchParams: Promise.resolve({}),
    });

    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("shows the scheduled cancellation date instead of the renewal date once cancel_at is set", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    createClientMock.mockResolvedValue(
      mainSupabase({
        billingRow: {
          subscription_status: "active",
          current_period_end: "2026-10-27T00:00:00.000Z",
          cancel_at: "2026-10-27T00:00:00.000Z",
        },
      }),
    );

    const result = await BillingPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
      searchParams: Promise.resolve({}),
    });

    const html = renderToStaticMarkup(result);

    expect(html).toContain("Cancels on");
    expect(html).not.toContain("Renews on");
  });

  it("shows no renewal or cancellation date for a canceled subscription, even with a stale current_period_end", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    createClientMock.mockResolvedValue(
      mainSupabase({
        billingRow: {
          subscription_status: "canceled",
          current_period_end: "2026-10-27T00:00:00.000Z",
          cancel_at: null,
        },
      }),
    );

    const result = await BillingPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
      searchParams: Promise.resolve({}),
    });

    const html = renderToStaticMarkup(result);

    expect(html).not.toContain("Renews on");
    expect(html).not.toContain("Cancels on");
  });
});
