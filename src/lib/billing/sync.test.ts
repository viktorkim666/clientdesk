import { describe, expect, it, vi } from "vitest";
import { syncWorkspaceBilling } from "@/lib/billing/sync";
import type {
  SyncStripeClient,
  SyncStripeCustomer,
  SyncStripeSubscription,
  SyncSupabaseClient,
} from "@/lib/billing/sync";

const CUSTOMER_ID = "cus_test_123";
const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

/** A `subscriptions.list()`-shaped Stripe subscription, minimal enough to
 * cover the fields `syncWorkspaceBilling` reads. */
function buildSubscription(overrides: {
  id?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  priceId?: string;
  currentPeriodEndSeconds?: number;
}): SyncStripeSubscription {
  return {
    id: overrides.id ?? "sub_test_123",
    status: overrides.status ?? "active",
    cancel_at_period_end: overrides.cancel_at_period_end ?? false,
    cancel_at: overrides.cancel_at ?? null,
    items: {
      data: [
        {
          price: { id: overrides.priceId ?? "price_pro" },
          current_period_end:
            overrides.currentPeriodEndSeconds ?? 1_700_000_000,
        },
      ],
    },
  };
}

/** A fake Stripe client exposing only what `syncWorkspaceBilling` calls,
 * typed as `SyncStripeClient` directly — no cast needed since the type
 * covers nothing beyond `subscriptions.list` and `customers.retrieve`. */
function buildStripe(options: {
  subscriptions?: SyncStripeSubscription[];
  customer?: SyncStripeCustomer;
}): SyncStripeClient {
  return {
    subscriptions: {
      list: vi.fn(() => Promise.resolve({ data: options.subscriptions ?? [] })),
    },
    customers: {
      retrieve: vi.fn(() =>
        Promise.resolve(options.customer ?? { metadata: {} }),
      ),
    },
  };
}

/** A fake Supabase admin client covering the one table this function
 * touches: a `select` for the existing row, and an `upsert` for the write. */
function buildSupabase(options: {
  existingWorkspaceId?: string | null;
  upsertError?: Error | null;
}): {
  spies: { upsert: ReturnType<typeof vi.fn> };
  client: SyncSupabaseClient;
} {
  const upsertSpy = vi.fn(() =>
    Promise.resolve({ error: options.upsertError ?? null }),
  );
  return {
    spies: { upsert: upsertSpy },
    client: {
      from: (table) => {
        if (table !== "workspace_billing") {
          throw new Error(`from() was not stubbed for table "${table}"`);
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    options.existingWorkspaceId === undefined
                      ? { workspace_id: WORKSPACE_ID }
                      : options.existingWorkspaceId === null
                        ? null
                        : { workspace_id: options.existingWorkspaceId },
                  error: null,
                }),
            }),
          }),
          upsert: upsertSpy,
        };
      },
    },
  };
}

describe("syncWorkspaceBilling", () => {
  it("upserts the subscription's status, price and item-level period end", async () => {
    const stripe = buildStripe({
      subscriptions: [
        buildSubscription({
          status: "active",
          priceId: "price_pro",
          currentPeriodEndSeconds: 1_700_000_000,
          cancel_at_period_end: false,
        }),
      ],
    });
    const supabase = buildSupabase({});

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        stripe_customer_id: CUSTOMER_ID,
        stripe_subscription_id: "sub_test_123",
        subscription_status: "active",
        price_id: "price_pro",
        current_period_end: new Date(1_700_000_000 * 1000).toISOString(),
        cancel_at: null,
      }),
      { onConflict: "workspace_id" },
    );
  });

  it("stores the subscription's cancel_at when Stripe schedules a cancellation directly, even though cancel_at_period_end is false", async () => {
    // The exact shape reproduced from the Stripe Customer Portal's "cancel
    // at end of billing period" flow: Stripe schedules the cancellation on
    // `cancel_at` and leaves `cancel_at_period_end` false, not true.
    const stripe = buildStripe({
      subscriptions: [
        buildSubscription({
          status: "active",
          cancel_at_period_end: false,
          cancel_at: 1_793_108_740,
        }),
      ],
    });
    const supabase = buildSupabase({});

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_at: new Date(1_793_108_740 * 1000).toISOString(),
      }),
      { onConflict: "workspace_id" },
    );
  });

  it("falls back to the item's current period end as cancel_at when cancel_at_period_end is true and cancel_at itself is null", async () => {
    const stripe = buildStripe({
      subscriptions: [
        buildSubscription({
          status: "active",
          cancel_at_period_end: true,
          cancel_at: null,
          currentPeriodEndSeconds: 1_700_000_000,
        }),
      ],
    });
    const supabase = buildSupabase({});

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_at: new Date(1_700_000_000 * 1000).toISOString(),
      }),
      { onConflict: "workspace_id" },
    );
  });

  it("clears the subscription fields when the customer has no subscription", async () => {
    const stripe = buildStripe({ subscriptions: [] });
    const supabase = buildSupabase({});

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        stripe_customer_id: CUSTOMER_ID,
        stripe_subscription_id: null,
        subscription_status: null,
        price_id: null,
        current_period_end: null,
        cancel_at: null,
      }),
      { onConflict: "workspace_id" },
    );
  });

  it("lists subscriptions with status all, newest first, limited to one", async () => {
    const stripe = buildStripe({ subscriptions: [] });
    const supabase = buildSupabase({});

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: CUSTOMER_ID,
      status: "all",
      limit: 1,
    });
  });

  it("falls back to the customer's workspace_id metadata when no row exists yet", async () => {
    const stripe = buildStripe({
      subscriptions: [buildSubscription({})],
      customer: { metadata: { workspace_id: "fallback-workspace" } },
    });
    const supabase = buildSupabase({ existingWorkspaceId: null });

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    expect(stripe.customers.retrieve).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: "fallback-workspace" }),
      { onConflict: "workspace_id" },
    );
  });

  it("throws when no row exists and the customer has no workspace_id metadata", async () => {
    const stripe = buildStripe({
      subscriptions: [],
      customer: { metadata: {} },
    });
    const supabase = buildSupabase({ existingWorkspaceId: null });

    await expect(
      syncWorkspaceBilling(CUSTOMER_ID, { stripe, supabase: supabase.client }),
    ).rejects.toThrow();
    expect(supabase.spies.upsert).not.toHaveBeenCalled();
  });

  it("throws when the upsert fails, so the caller (webhook route) can retry", async () => {
    const stripe = buildStripe({ subscriptions: [] });
    const supabase = buildSupabase({ upsertError: new Error("db down") });

    await expect(
      syncWorkspaceBilling(CUSTOMER_ID, { stripe, supabase: supabase.client }),
    ).rejects.toThrow();
  });

  it("targets the workspace_id primary key, so a workspace whose row already exists under an older customer id is updated instead of duplicated", async () => {
    // No row is found under the new customer id (it was recreated in
    // Stripe), so the fallback path resolves the workspace from the
    // customer's metadata, the same as any other first-sync-for-this-
    // customer-id case — the fix under test is which column the upsert
    // targets, not how the workspace is found.
    const stripe = buildStripe({
      subscriptions: [buildSubscription({})],
      customer: { metadata: { workspace_id: WORKSPACE_ID } },
    });
    const supabase = buildSupabase({ existingWorkspaceId: null });

    await syncWorkspaceBilling(CUSTOMER_ID, {
      stripe,
      supabase: supabase.client,
    });

    // onConflict: "workspace_id" makes this an UPDATE of the workspace's
    // existing row (by its primary key) rather than an INSERT that would
    // collide with that same primary key because the row already exists
    // under the old customer id.
    expect(supabase.spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WORKSPACE_ID,
        stripe_customer_id: CUSTOMER_ID,
      }),
      { onConflict: "workspace_id" },
    );
  });

  it("logs and returns without throwing when the customer was deleted in Stripe, so the webhook answers 200 instead of retrying forever", async () => {
    const stripe = buildStripe({
      subscriptions: [],
      customer: { deleted: true },
    });
    const supabase = buildSupabase({ existingWorkspaceId: null });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      syncWorkspaceBilling(CUSTOMER_ID, { stripe, supabase: supabase.client }),
    ).resolves.toBeUndefined();

    expect(supabase.spies.upsert).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
