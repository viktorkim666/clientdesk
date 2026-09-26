"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { signOut, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = { ok: true };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}

export function SignOutButton() {
  const [state, formAction] = useActionState(signOut, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
