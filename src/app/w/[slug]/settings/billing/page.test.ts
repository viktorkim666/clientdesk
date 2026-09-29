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
  clientCount?: number;
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
            eq: () =>
              Promise.resolve({
                count: options?.clientCount ?? 0,
                error: null,
              }),
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

  describe("layout", () => {
    async function render(
      role: "owner" | "member",
      options?: Parameters<typeof mainSupabase>[0],
    ) {
      getCurrentWorkspaceMock.mockResolvedValue(workspace(role));
      createClientMock.mockResolvedValue(mainSupabase(options));
      const result = await BillingPage({
        params: Promise.resolve({ slug: WORKSPACE_SLUG }),
        searchParams: Promise.resolve({}),
      });
      return renderToStaticMarkup(result);
    }

    function text(html: string) {
      return html
        .replace(/<!-- -->/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
    }

    const exactCount = (html: string, value: string) =>
      (html.match(new RegExp(`>\\s*${value}\\s*<`, "g")) ?? []).length;

    it("renders the header with a description", async () => {
      const html = await render("owner");

      expect(html).toMatch(/<h1[^>]*>Billing<\/h1>\s*<p[^>]*>[^<]+<\/p>/);
    });

    it("shows the Free badge once, the usage text and a progress bar", async () => {
      const html = await render("owner", { clientCount: 1 });

      expect(exactCount(html, "Free")).toBe(1);
      expect(text(html)).toContain("1 / 2 clients used");
      expect(text(html)).not.toContain("clients used.");
      expect(html).toMatch(/role="progressbar"[^>]*aria-label="[^"]+"/);
      expect(html).toContain('aria-valuenow="1"');
      expect(html).toContain('aria-valuemax="2"');
      expect(text(html)).toContain("Up to 2 clients");
    });

    it("shows Pro once with unlimited clients and no progress bar", async () => {
      const html = await render("owner", {
        billingRow: {
          subscription_status: "active",
          current_period_end: "2026-10-27T00:00:00.000Z",
          cancel_at: null,
        },
      });

      expect(exactCount(html, "Pro")).toBe(1);
      expect(exactCount(html, "Free")).toBe(0);
      expect(text(html)).toContain("Unlimited clients");
      expect(text(html)).toContain("AI update drafts");
      expect(text(html)).toContain("Renews on Oct 27, 2026");
      expect(html).not.toContain('role="progressbar"');
    });

    it("makes every card title a real h2 heading", async () => {
      const html = await render("owner", { clientCount: 1 });

      expect(html).toMatch(/<h2[^>]*>Plan\s*<span[^>]*>Free<\/span><\/h2>/);
      expect(html).toMatch(/<h2[^>]*>Pro<\/h2>/);
      expect(html).toMatch(/<h2[^>]*>Test mode<\/h2>/);
    });

    it("shows the current plan and a Pro card on the Free plan", async () => {
      const html = await render("owner", { clientCount: 1 });

      expect(exactCount(html, "Pro")).toBe(1);
      expect(text(html)).toContain("Unlimited clients");
      expect(text(html)).toContain("AI update drafts");
    });

    it("moves the single Upgrade to Pro button into the Pro card and keeps Resync in the plan card", async () => {
      const html = await render("owner");
      const upgrade = html.indexOf('aria-label="Upgrade to Pro"');
      const proCard = html.indexOf(">Pro<");
      const resync = html.indexOf('aria-label="Resync"');

      expect(html.match(/aria-label="Upgrade to Pro"/g)).toHaveLength(1);
      expect(html.match(/aria-label="Resync"/g)).toHaveLength(1);
      expect(resync).toBeGreaterThan(-1);
      expect(resync).toBeLessThan(proCard);
      expect(proCard).toBeLessThan(upgrade);
    });

    it("shows a member the Pro card without actions and says only the owner can change the plan", async () => {
      const html = await render("member");

      expect(exactCount(html, "Pro")).toBe(1);
      expect(html).not.toContain('aria-label="Upgrade to Pro"');
      expect(html).not.toContain('aria-label="Resync"');
      expect(text(html)).toContain(
        "Only the workspace owner can change the plan.",
      );
    });

    it("keeps a single current-plan card with Manage subscription on Pro", async () => {
      const html = await render("owner", {
        billingRow: {
          subscription_status: "active",
          current_period_end: "2026-10-27T00:00:00.000Z",
          cancel_at: null,
        },
      });

      expect(html).toContain('aria-label="Manage subscription"');
      expect(html).toContain('aria-label="Resync"');
      expect(html).not.toContain('aria-label="Upgrade to Pro"');
      expect(text(html)).not.toContain("Only the workspace owner");
    });

    it("never repeats the word Free outside the plan badge, so the badge stays a unique text match", async () => {
      const html = await render("owner", { clientCount: 1 });

      expect(text(html).match(/free/gi)).toHaveLength(1);
    });

    it("puts the Stripe test-card note in a separate Test mode card", async () => {
      const html = await render("member");

      expect(text(html)).toContain("Test mode");
      expect(text(html)).toContain(
        "Billing runs in Stripe test mode. Use test card 4242 4242 4242 4242, any future expiry date and any CVC.",
      );
    });

    it("renders the billing actions for the owner only", async () => {
      const ownerHtml = await render("owner");
      const memberHtml = await render("member");

      expect(ownerHtml).toContain('aria-label="Upgrade to Pro"');
      expect(ownerHtml).toContain('aria-label="Resync"');
      expect(memberHtml).not.toContain('aria-label="Upgrade to Pro"');
    });
  });
});
