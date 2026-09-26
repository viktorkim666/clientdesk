import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * A Supabase client for use in Server Components, Server Actions and Route
 * Handlers. Creates a fresh client per call, per the `@supabase/ssr` docs:
 * never share one client across requests.
 *
 * `setAll` can fail when called from a Server Component that cannot set
 * cookies (e.g. during static rendering); that failure is safe to ignore as
 * long as `src/proxy.ts` refreshes the session on every request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component that cannot set cookies.
            // The proxy refreshes the session on every request instead.
          }
        },
      },
    },
  );
}
