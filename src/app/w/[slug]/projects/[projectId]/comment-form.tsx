"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postComment, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true };

// Deterministic so a deleted comment can hand focus to its update's form.
export function commentBodyId(updateId: string): string {
  return `comment-body-${updateId}`;
}

export function CommentForm({
  workspaceId,
  workspaceSlug,
  projectId,
  updateId,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  updateId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const bodyId = commentBodyId(updateId);

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await postComment(
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
    <form ref={formRef} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="updateId" value={updateId} />
      <Label htmlFor={bodyId} className="sr-only">
        Write a comment
      </Label>
      <Textarea
        id={bodyId}
        name="body"
        required
        rows={2}
        placeholder="Write a comment..."
      />
      {!state.ok ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="xs"
        variant="secondary"
        disabled={pending}
        className="self-end"
      >
        {pending ? "Posting..." : "Comment"}
      </Button>
    </form>
  );
}
