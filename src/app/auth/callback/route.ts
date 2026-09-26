import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/auth/post-login-redirect";

/** Exchanges the OAuth/email code for a session, then redirects like the auth actions do. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const redirectTo = await resolvePostAuthRedirect(
        supabase,
        data.user.id,
        next,
      );
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
