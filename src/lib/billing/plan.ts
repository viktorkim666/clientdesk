/**
 * The Free plan's client limit, mirrored by the `before insert` trigger in
 * `supabase/migrations/*_billing.sql`. Kept as a constant in both places
 * instead of one reading the other, since the UI and the database run in
 * different runtimes.
 */
export const FREE_CLIENT_LIMIT = 2;

export type Plan = "free" | "pro";

/**
 * Mirrors `private.workspace_plan(workspace_id)`: a workspace is Pro while
 * Stripe still expects to be paid for it — `active`, `trialing` or
 * `past_due` (a retry is in progress). Any other status, or no subscription
 * at all, is Free.
 */
export function planFromStatus(status: string | null): Plan {
  return status === "active" || status === "trialing" || status === "past_due"
    ? "pro"
    : "free";
}
