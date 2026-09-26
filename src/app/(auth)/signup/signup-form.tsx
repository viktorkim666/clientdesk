"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signUp,
  signInWithGoogle,
  type AuthActionState,
} from "@/app/(auth)/actions";

const initialState: AuthActionState = { ok: true };

export function SignUpForm({
  next,
  googleEnabled,
}: {
  next: string | null;
  googleEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [googleState, googleFormAction, googlePending] = useActionState(
    signInWithGoogle,
    initialState,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {!state.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account..." : "Sign up"}
        </Button>
      </form>
      {googleEnabled ? (
        <form action={googleFormAction} className="space-y-2">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          {!googleState.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {googleState.error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={googlePending}
          >
            {googlePending ? "Redirecting..." : "Continue with Google"}
          </Button>
        </form>
      ) : null}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
