"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation, type AcceptInvitationState } from "./actions";

const initialState: AcceptInvitationState = { ok: true };

export function AcceptInvitationForm({ token }: { token: string }) {
  const boundAction = acceptInvitation.bind(null, token);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Accepting..." : "Accept invitation"}
      </Button>
    </form>
  );
}
