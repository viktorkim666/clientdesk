import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * A Supabase client authenticated with the secret key, bypassing RLS. Used
 * only by billing code that writes `workspace_billing` — the webhook, the
 * sync function and the owner-only checkout action — never by anything that
 * handles a request on a caller's behalf.
 *
 * Returns `null` when `SUPABASE_SECRET_KEY` is not set, matching
 * `getStripe`: billing code checks for `null` and reports itself as not
 * configured instead of throwing.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SECRET_KEY) {
    return null;
  }

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
