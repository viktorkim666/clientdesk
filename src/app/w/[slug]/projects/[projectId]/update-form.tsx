"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { postUpdate, type PostUpdateResult } from "./actions";

const initialState: PostUpdateResult = { ok: true };

export function UpdateForm({
  workspaceId,
  workspaceSlug,
  projectId,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: PostUpdateResult, formData: FormData) => {
      const result = await postUpdate(
        workspaceId,
        workspaceSlug,
        projectId,
        formData,
      );
      if (result.ok) {
        formRef.current?.reset();
      }
      return result;
    },
    initialState,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Label htmlFor="update-body" className="sr-only">
        Post an update for the client
      </Label>
      <textarea
        id="update-body"
        name="body"
        required
        rows={3}
        placeholder="Post an update for the client..."
        className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.warning ? (
        <p role="status" className="text-sm text-amber-600">
          {state.warning}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Posting..." : "Post update"}
      </Button>
    </form>
  );
}
