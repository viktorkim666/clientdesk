"use client";

import { useActionState, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { postComment, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true };

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
  const bodyId = useId();

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
      <textarea
        id={bodyId}
        name="body"
        required
        rows={2}
        placeholder="Write a comment..."
        className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
