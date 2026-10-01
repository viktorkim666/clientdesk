"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { deleteComment } from "./actions";
import { commentReplyId } from "./comment-form";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

export type CommentRowData = {
  id: string;
  body: string;
  createdAt: string;
  createdLabel: string;
  createdTitle: string;
  authorId: string | null;
  authorName: string;
};

export function CommentRow({
  workspaceId,
  workspaceSlug,
  projectId,
  updateId,
  comment,
  canDelete,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  updateId: string;
  comment: CommentRowData;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const restoreFocus = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The trigger is disabled while the delete runs, so focus can only return
  // to it once the transition has ended.
  useEffect(() => {
    if (restoreFocus.current && !pending) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [pending]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteComment(
          workspaceId,
          workspaceSlug,
          projectId,
          comment.id,
        );
        // This row is about to disappear, so focus goes to the Reply button
        // of the same update instead of falling back to the page body.
        if (result.ok) {
          document.getElementById(commentReplyId(updateId))?.focus();
        } else {
          setError(result.error);
          restoreFocus.current = true;
        }
      } catch {
        setError("Could not delete the comment");
        restoreFocus.current = true;
      }
    });
  }

  return (
    <li className="flex gap-2 text-sm">
      <UserAvatar name={comment.authorName} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{comment.authorName}</span>
          <time
            dateTime={comment.createdAt}
            title={comment.createdTitle}
            className="text-xs text-muted-foreground"
          >
            {comment.createdLabel}
          </time>
        </div>
        <p className="whitespace-pre-line">{comment.body}</p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {canDelete ? (
        // Its own column, so the touch target can reach 44px on mobile
        // without covering any of the comment text.
        <ConfirmDeleteDialog
          title="Delete this comment?"
          description="The comment is removed for everyone and can't be restored."
          onConfirm={handleDelete}
          trigger={
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mt-2.5 size-11 shrink-0 sm:mt-0 sm:size-7"
              disabled={pending}
              aria-label={`Delete comment by ${comment.authorName}`}
            >
              <X aria-hidden="true" />
            </Button>
          }
        />
      ) : null}
    </li>
  );
}
