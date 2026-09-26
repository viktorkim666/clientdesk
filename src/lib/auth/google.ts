import { env } from "@/lib/env";

/** The Google sign-in button only renders once real OAuth credentials exist. */
export function isGoogleAuthEnabled(): boolean {
  return Boolean(
    env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID &&
    env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
  );
}
