import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * A Supabase client for use in Server Components, Server Actions and Route
 * Handlers. `cache()`d so every caller in the same request (e.g. a layout
 * and the page under it) shares one client instead of each building its own
 * from a fresh `cookies()` read - per the `@supabase/ssr` guidance, a client
 * must never be shared *across requests*, but one per request is exactly
 * what `cache()` gives here: outside a render (a fresh request), it isn't
 * memoized at all (see `getCurrentWorkspace`'s doc comment), and Next.js
 * resets its render cache between requests either way.
 *
 * `setAll` can still fail when called from a Server Component that cannot
 * set cookies (e.g. during static rendering); that failure is safe to
 * ignore as long as `src/proxy.ts` refreshes the session on every request.
 * Caching only the client construction, not `cookieStore.set` itself, means
 * cookie writes from Server Actions and Route Handlers (e.g. login/signup
 * setting auth cookies) still run on every call, same as before.
 */
export const createClient = cache(async function createClient() {
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
});
