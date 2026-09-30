import "server-only";
import { z } from "zod";
import { optionalString } from "@/lib/env";

const serverEnvSchema = z.object({
  // All four are optional: without them the billing page reports itself as
  // unconfigured instead of the app failing to build, so CI and local work
  // without Stripe keys still work (see the plan's "Configuration" decision).
  STRIPE_SECRET_KEY: optionalString(),
  STRIPE_WEBHOOK_SECRET: optionalString(),
  STRIPE_PRO_PRICE_ID: optionalString(),
  SUPABASE_SECRET_KEY: optionalString(),
  // Optional for the same reason: without it, the AI draft generator falls
  // back to a fake one outside production (see the plan's "Configuration"
  // decision).
  ANTHROPIC_API_KEY: optionalString(),
  // Optional: outside production the demo falls back to a fixed development
  // salt; production without it reports the live demo as not configured.
  DEMO_VISITOR_SALT: optionalString(),
  // Optional: without it the cleanup cron route refuses every request.
  CRON_SECRET: optionalString(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates the server-only variables against the schema above. Exported for
 * tests; the app itself uses `serverEnv` below.
 */
export function parseServerEnv(raw: unknown): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment variables: ${issues}`);
  }

  return result.data;
}

export const serverEnv = parseServerEnv({
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEMO_VISITOR_SALT: process.env.DEMO_VISITOR_SALT,
  CRON_SECRET: process.env.CRON_SECRET,
});
