import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type WorkspaceBillingInsert =
  Database["public"]["Tables"]["workspace_billing"]["Insert"];

/**
 * The one Stripe subscription shape `syncWorkspaceBilling` reads off
 * `subscriptions.list()` — narrow enough that tests can build a plain
 * object for it, without depending on the full `Stripe.Subscription` type.
 */
export interface SyncStripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: {
    data: { price: { id: string }; current_period_end: number }[];
  };
}

/**
 * Either shape `customers.retrieve()` can resolve to: a live customer
 * (its `workspace_id` metadata is the fallback source of truth for a
 * customer with no `workspace_billing` row yet) or a deleted one.
 */
export type SyncStripeCustomer =
  { deleted: true } | { metadata: { workspace_id?: string } };

/**
 * The Stripe calls `syncWorkspaceBilling` makes, and nothing else — tests
 * inject a plain object shaped like this instead of a full `Stripe` client
 * (mirrors `getEmailSender`'s fake senders). The real `Stripe` client
 * structurally satisfies this, so callers pass it in unchanged.
 */
export interface SyncStripeClient {
  subscriptions: {
    list: (params: {
      customer: string;
      status: "all";
      limit: number;
    }) => PromiseLike<{ data: SyncStripeSubscription[] }>;
  };
  customers: {
    retrieve: (id: string) => PromiseLike<SyncStripeCustomer>;
  };
}

/**
 * The Supabase calls `syncWorkspaceBilling` makes against
 * `workspace_billing`, and nothing else. The real admin `SupabaseClient`
 * structurally satisfies this, so callers pass it in unchanged.
 */
export interface SyncSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { workspace_id: string } | null;
          error: Error | null;
        }>;
      };
    };
    upsert: (
      row: WorkspaceBillingInsert,
      options: { onConflict: string },
    ) => PromiseLike<{ error: Error | null }>;
  };
}

export type SyncDeps = {
  stripe: SyncStripeClient;
  supabase: SyncSupabaseClient;
};

/**
 * Adapts the real admin `SupabaseClient` to `SyncSupabaseClient` for
 * callers (the webhook route, the checkout and resync actions). The two
 * types are structurally compatible — the real client is a superset — but
 * `SupabaseClient<Database>`'s generated Postgrest builder chain is deep
 * enough that TypeScript's checker can't prove that inline at a call site
 * without hitting "type instantiation is excessively deep" (TS2589).
 * Isolating the assertion here, once, keeps every call site plain.
 */
export function toSyncSupabaseClient(
  client: SupabaseClient<Database>,
): SyncSupabaseClient {
  return {
    from: (table) => {
      const builder = client.from(table as "workspace_billing");
      return {
        select: (columns) => {
          const filtered = builder.select(columns);
          return {
            eq: (column, value) => {
              const matched = filtered.eq(column, value);
              return {
                maybeSingle: () => matched.maybeSingle(),
              };
            },
          };
        },
        upsert: (row, options) => builder.upsert(row, options),
      };
    },
  };
}

/**
 * Re-reads a customer's current subscription from Stripe and upserts it
 * into `workspace_billing`, keyed by `stripe_customer_id`. This is the one
 * place billing state is written (see the plan's "Source of truth"
 * decision) — the webhook, the checkout success redirect and the owner's
 * Resync button all call this instead of trusting event payloads.
 *
 * `stripe` and `supabase` are passed in rather than constructed here so
 * tests can inject fakes without mocking modules (mirrors `getEmailSender`).
 */
export async function syncWorkspaceBilling(
  customerId: string,
  { stripe, supabase }: SyncDeps,
): Promise<void> {
  const { data: subscriptions } = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
  });
  const subscription = subscriptions[0] ?? null;
  const item = subscription?.items.data[0] ?? null;

  const { data: existingRow } = await supabase
    .from("workspace_billing")
    .select("workspace_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  let workspaceId = existingRow?.workspace_id ?? null;
  if (!workspaceId) {
    // No row yet means this is the first sync for a customer created by
    // `startCheckout`, which stamps `metadata.workspace_id` before Stripe
    // ever calls back.
    const customer = await stripe.customers.retrieve(customerId);
    if (!("metadata" in customer)) {
      // A deleted customer that never got a workspace_billing row can't be
      // resolved to a workspace at all. That's terminal, not retryable:
      // log and stop instead of throwing, so the webhook answers Stripe
      // with 200 rather than retrying delivery for days.
      console.error(
        `syncWorkspaceBilling: customer ${customerId} is deleted and has no workspace_billing row; skipping`,
      );
      return;
    }
    workspaceId = customer.metadata.workspace_id ?? null;
  }
  if (!workspaceId) {
    throw new Error(
      `syncWorkspaceBilling: no workspace found for customer ${customerId}`,
    );
  }

  const { error } = await supabase.from("workspace_billing").upsert(
    {
      workspace_id: workspaceId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription?.id ?? null,
      subscription_status: subscription?.status ?? null,
      price_id: item?.price.id ?? null,
      current_period_end: item
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      // Stripe's Customer Portal "cancel at end of billing period" flow
      // schedules the cancellation on `cancel_at` and leaves
      // `cancel_at_period_end` false — reading only the boolean silently
      // dropped that cancellation. `cancel_at_period_end` is still checked
      // as a fallback for the API/dashboard cancellation path, which sets
      // the boolean without ever populating `cancel_at` itself.
      cancel_at: subscription
        ? subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : subscription.cancel_at_period_end && item
            ? new Date(item.current_period_end * 1000).toISOString()
            : null
        : null,
      updated_at: new Date().toISOString(),
    },
    // Targets the primary key, not the unique stripe_customer_id: a
    // workspace whose row already exists under an older customer id (the
    // customer was recreated in Stripe) is *updated*, not duplicated —
    // an insert keyed by stripe_customer_id would collide with that row's
    // own workspace_id primary key instead of replacing it.
    { onConflict: "workspace_id" },
  );

  if (error) {
    throw error;
  }
}
