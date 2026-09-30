import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * A Supabase client authenticated with the secret key, bypassing RLS. Two
 * kinds of server code use it, and nothing that handles a request on a
 * caller's behalf does:
 *
 * - billing code that writes `workspace_billing` (the webhook, the sync
 *   function and the owner-only checkout action);
 * - the demo code, which creates and deletes sandbox users and workspaces
 *   (`src/lib/demo`, the demo server actions and the cleanup cron).
 *
 * Returns `null` when `SUPABASE_SECRET_KEY` is not set, matching
 * `getStripe`: callers check for `null` and report themselves as not
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
