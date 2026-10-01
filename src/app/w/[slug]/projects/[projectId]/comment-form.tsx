"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postComment, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true };

function commentBodyId(updateId: string): string {
  return `comment-body-${updateId}`;
}

// Deterministic so a deleted comment can hand focus to its update's Reply
// button.
export function commentReplyId(updateId: string): string {
  return `comment-reply-${updateId}`;
}

function commentFormId(updateId: string): string {
  return `comment-form-${updateId}`;
}

function commentErrorId(updateId: string): string {
  return `comment-error-${updateId}`;
}

export function CommentForm({
  workspaceId,
  workspaceSlug,
  projectId,
  updateId,
  authorName,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  updateId: string;
  authorName: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const bodyId = commentBodyId(updateId);
  const replyId = commentReplyId(updateId);
  const formId = commentFormId(updateId);
  const errorId = commentErrorId(updateId);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The failed result whose error the user already closed the form on, so
  // reopening the form does not show it again.
  const [dismissed, setDismissed] = useState<ActionResult | null>(null);
  // Focus moves only after a user-driven change, never on first render.
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    document.getElementById(open ? bodyId : replyId)?.focus();
  }, [open, bodyId, replyId]);

  function expand() {
    moveFocus.current = true;
    setAnnouncement("");
    setOpen(true);
  }

  function closeForm(discardDraft: boolean, restoreFocus: boolean) {
    moveFocus.current = restoreFocus;
    if (discardDraft) formRef.current?.reset();
    setOpen(false);
  }

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await postComment(
        workspaceId,
        workspaceSlug,
        projectId,
        formData,
      );
      if (result.ok) {
        // Focus goes back to Reply only when the user has not moved on to
        // something else while the comment was posting.
        const active = document.activeElement;
        const focusIsHere =
          !active ||
          active === document.body ||
          formRef.current?.contains(active) === true;
        closeForm(true, focusIsHere);
        setAnnouncement("Comment posted");
      }
      return result;
    },
    initialState,
  );

  // Escape and Cancel: the error that is showing goes with the form.
  function collapse(discardDraft: boolean) {
    setDismissed(state);
    closeForm(discardDraft, true);
  }

  const showError = !state.ok && state !== dismissed;

  return (
    <div className="flex flex-col gap-1">
      <Button
        id={replyId}
        type="button"
        size="xs"
        variant="ghost"
        aria-label={`Reply to ${authorName}'s update`}
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => (open ? collapse(false) : expand())}
        className="self-start text-muted-foreground"
      >
        Reply
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <form
        id={formId}
        ref={formRef}
        action={formAction}
        hidden={!open}
        onSubmit={(event) => {
          // aria-disabled does not stop a submit, so a second one is blocked
          // here while the first is still posting.
          if (pending) event.preventDefault();
        }}
        onKeyDown={(event) => {
          // Escape during IME composition only cancels the composition.
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.stopPropagation();
            collapse(false);
          }
        }}
        className="flex flex-col gap-1"
      >
        <input type="hidden" name="updateId" value={updateId} />
        <Label htmlFor={bodyId} className="sr-only">
          Write a reply to {authorName}&apos;s update
        </Label>
        <Textarea
          id={bodyId}
          name="body"
          required
          rows={2}
          placeholder="Write a comment..."
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? errorId : undefined}
        />
        {showError && !state.ok ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => collapse(true)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="xs"
            variant="secondary"
            aria-disabled={pending}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            {pending ? "Posting..." : "Comment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
