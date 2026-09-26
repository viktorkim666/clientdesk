"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createWorkspace, type OnboardingActionState } from "./actions";

const initialState: OnboardingActionState = { ok: true };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createWorkspace,
    initialState,
  );
  const [name, setName] = useState("");

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Agency"
        />
        {name.trim() ? (
          <p className="text-sm text-muted-foreground">
            Your workspace URL will start with{" "}
            <span className="font-mono">/w/{slugify(name)}</span>
          </p>
        ) : null}
      </div>
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating workspace..." : "Create workspace"}
      </Button>
    </form>
  );
}
