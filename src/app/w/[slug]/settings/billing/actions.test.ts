import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";
const SITE_URL = "http://localhost:3000";

const {
  getCurrentWorkspaceMock,
  createClientMock,
  createAdminClientMock,
  getStripeMock,
  isBillingConfiguredMock,
  syncWorkspaceBillingMock,
  revalidatePathMock,
  redirectMock,
} = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  getStripeMock: vi.fn(),
  isBillingConfiguredMock: vi.fn(() => true),
  syncWorkspaceBillingMock: vi.fn(() => Promise.resolve()),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
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

import { openBillingPortal, resyncBilling, startCheckout } from "./actions";

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

/** Chainable admin `.from("workspace_billing")` stub. */
function adminClient(options: {
  billingRow?: {
    stripe_customer_id: string;
    subscription_status?: string | null;
  } | null;
  upsertError?: { message: string } | null;
}) {
  const upsertSpy = vi.fn(() =>
    Promise.resolve({ error: options.upsertError ?? null }),
  );
  return {
    spies: { upsert: upsertSpy },
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: options.billingRow ?? null,
                error: null,
              }),
          }),
        }),
        upsert: upsertSpy,
      }),
    },
  };
}

function stripeClient() {
  return {
    customers: {
      create: vi.fn(() => Promise.resolve({ id: "cus_new_123" })),
    },
    checkout: {
      sessions: {
        create: vi.fn(() =>
          Promise.resolve({ url: "https://checkout.stripe.test/session" }),
        ),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(() =>
          Promise.resolve({ url: "https://portal.stripe.test/session" }),
        ),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isBillingConfiguredMock.mockReturnValue(true);
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  createClientMock.mockResolvedValue({
    auth: {
      getClaims: () =>
        Promise.resolve({ data: { claims: { email: "owner@example.com" } } }),
    },
  });
});

describe("startCheckout", () => {
  it("rejects a member without calling Stripe", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("member"));

    const result = await startCheckout(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Only the workspace owner can manage billing",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a client without calling Stripe", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));

    const result = await startCheckout(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Only the workspace owner can manage billing",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("reports not configured without calling Stripe or the admin client", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    isBillingConfiguredMock.mockReturnValue(false);

    const result = await startCheckout(WORKSPACE_SLUG);

    expect(result).toEqual({ ok: false, error: "Billing is not configured" });
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("creates a customer and redirects to checkout when the workspace has none yet", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({ billingRow: null });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    await expect(startCheckout(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.test/session",
    );

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        metadata: { workspace_id: WORKSPACE_ID },
      }),
      { idempotencyKey: `billing-customer-${WORKSPACE_ID}` },
    );
    expect(admin.spies.upsert).toHaveBeenCalledWith(
      {
        workspace_id: WORKSPACE_ID,
        stripe_customer_id: "cus_new_123",
      },
      { onConflict: "workspace_id" },
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_new_123",
        client_reference_id: WORKSPACE_ID,
        success_url: `${SITE_URL}/w/${WORKSPACE_SLUG}/settings/billing?checkout=success`,
        cancel_url: `${SITE_URL}/w/${WORKSPACE_SLUG}/settings/billing`,
      }),
    );
  });

  it("does not error on a second concurrent call for the same workspace, since Stripe's idempotency key returns the same customer id both times", async () => {
    // Two requests race with the same stale read of no existing row (a
    // double-click, or a retried request); Stripe's idempotency key means
    // both calls to `customers.create` resolve to the same customer id,
    // and the write must target workspace_id's own primary key so the
    // second write updates the first row rather than erroring on it.
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({ billingRow: null });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    await expect(startCheckout(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.test/session",
    );
    await expect(startCheckout(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.test/session",
    );

    expect(admin.spies.upsert).toHaveBeenCalledTimes(2);
    expect(admin.spies.upsert).toHaveBeenNthCalledWith(
      2,
      {
        workspace_id: WORKSPACE_ID,
        stripe_customer_id: "cus_new_123",
      },
      { onConflict: "workspace_id" },
    );
  });

  it("reuses an existing Free customer instead of creating a new one", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({
      billingRow: {
        stripe_customer_id: "cus_existing",
        subscription_status: "canceled",
      },
    });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    await expect(startCheckout(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
    );
  });

  it("sends an already-Pro workspace to the billing portal instead of checkout", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({
      billingRow: {
        stripe_customer_id: "cus_pro",
        subscription_status: "active",
      },
    });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    await expect(startCheckout(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:https://portal.stripe.test/session",
    );

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_pro" }),
    );
  });

  it("returns a generic error when Stripe fails", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({ billingRow: null });
    const stripe = stripeClient();
    stripe.customers.create.mockRejectedValueOnce(new Error("Stripe is down"));
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await startCheckout(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Could not reach Stripe. Try again.",
    });
    expect(redirectMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("openBillingPortal", () => {
  it("rejects a member without calling Stripe", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("member"));

    const result = await openBillingPortal(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Only the workspace owner can manage billing",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("redirects the owner to the billing portal", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({
      billingRow: { stripe_customer_id: "cus_existing" },
    });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    await expect(openBillingPortal(WORKSPACE_SLUG)).rejects.toThrow(
      "NEXT_REDIRECT:https://portal.stripe.test/session",
    );
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        return_url: `${SITE_URL}/w/${WORKSPACE_SLUG}/settings/billing`,
      }),
    );
  });
});

describe("resyncBilling", () => {
  it("rejects a client without calling Stripe", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));

    const result = await resyncBilling(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Only the workspace owner can manage billing",
    });
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("syncs and revalidates the billing page for the owner", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({
      billingRow: { stripe_customer_id: "cus_existing" },
    });
    const stripe = stripeClient();
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripe);

    const result = await resyncBilling(WORKSPACE_SLUG);

    expect(result).toEqual({ ok: true });
    expect(syncWorkspaceBillingMock).toHaveBeenCalledWith(
      "cus_existing",
      expect.objectContaining({ stripe, supabase: admin.client }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/settings/billing`,
    );
  });

  it("returns a generic error when the sync fails", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    const admin = adminClient({
      billingRow: { stripe_customer_id: "cus_existing" },
    });
    createAdminClientMock.mockReturnValue(admin.client);
    getStripeMock.mockReturnValue(stripeClient());
    syncWorkspaceBillingMock.mockRejectedValueOnce(new Error("Stripe is down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await resyncBilling(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Could not refresh billing status",
    });
    consoleErrorSpy.mockRestore();
  });

  it("returns the same generic error as a sync failure when the admin select itself throws", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("owner"));
    createAdminClientMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.reject(new Error("db down")),
          }),
        }),
      }),
    });
    getStripeMock.mockReturnValue(stripeClient());
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await resyncBilling(WORKSPACE_SLUG);

    expect(result).toEqual({
      ok: false,
      error: "Could not refresh billing status",
    });
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
