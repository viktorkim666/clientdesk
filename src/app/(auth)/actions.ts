"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logInSchema, signUpSchema } from "@/lib/validation/auth";
import { resolvePostAuthRedirect } from "@/lib/auth/post-login-redirect";
import { isGoogleAuthEnabled } from "@/lib/auth/google";
import { env } from "@/lib/env";

export type AuthActionState = { ok: true } | { ok: false; error: string };

const initialInputError = "Invalid input";

function readNext(formData: FormData): string | null {
  const next = formData.get("next");
  return typeof next === "string" && next.length > 0 ? next : null;
}

export async function logIn(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = logInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? initialInputError,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { ok: false, error: "Incorrect email or password" };
  }

  const redirectTo = await resolvePostAuthRedirect(
    supabase,
    data.user.id,
    readNext(formData),
  );
  redirect(redirectTo);
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? initialInputError,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Could not create the account",
    };
  }

  const redirectTo = await resolvePostAuthRedirect(
    supabase,
    data.user.id,
    readNext(formData),
  );
  redirect(redirectTo);
}

export async function signInWithGoogle(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isGoogleAuthEnabled()) {
    return { ok: false, error: "Google sign-in is not configured" };
  }

  const supabase = await createClient();
  const next = readNext(formData);
  const callbackUrl = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL);
  if (next) {
    callbackUrl.searchParams.set("next", next);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data.url) {
    console.error("signInWithGoogle action failed", error);
    return { ok: false, error: "Could not start Google sign-in" };
  }

  redirect(data.url);
}

export async function signOut(
  _prevState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  // Required by useActionState's (prevState, formData) signature; neither is used here.
  void _prevState;
  void _formData;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("signOut action failed", error);
    return { ok: false, error: "Could not sign out. Try again." };
  }

  redirect("/login");
}
