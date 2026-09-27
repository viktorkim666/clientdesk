import "server-only";
import Stripe from "stripe";
import { serverEnv, type ServerEnv } from "@/lib/env.server";

/**
 * A Stripe client for server-only billing code, or `null` when
 * `STRIPE_SECRET_KEY` is not set — CI and local work without Stripe keys
 * still build (see the plan's "Configuration" decision).
 *
 * No explicit `apiVersion`: `stripe-node` defaults it to the version its own
 * installed package matches, per its README. Passing a separate version
 * string here could drift from the types this package version ships, so the
 * exact pin in `package.json` is what keeps the API version predictable.
 */
export function getStripe(
  secretKey: string | undefined = serverEnv.STRIPE_SECRET_KEY,
): Stripe | null {
  return secretKey ? new Stripe(secretKey) : null;
}

/**
 * True once every variable billing needs is set. The billing page and its
 * server actions (Tasks 3-5) use this to show "not configured" and disable
 * checkout, portal and resync instead of failing.
 */
export function isBillingConfigured(
  env: Partial<ServerEnv> = serverEnv,
): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.STRIPE_PRO_PRICE_ID &&
    env.SUPABASE_SECRET_KEY,
  );
}
