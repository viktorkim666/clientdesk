"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteComment } from "./actions";

export type CommentRowData = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

export function CommentRow({
  workspaceId,
  workspaceSlug,
  projectId,
  comment,
  canDelete,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  comment: CommentRowData;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="rounded-md bg-muted/50 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{comment.authorName}</span>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            aria-label="Delete comment"
            onClick={() =>
              startTransition(() => {
                void deleteComment(
                  workspaceId,
                  workspaceSlug,
                  projectId,
                  comment.id,
                );
              })
            }
          >
            ×
          </Button>
        ) : null}
      </div>
      <p className="whitespace-pre-line">{comment.body}</p>
    </li>
  );
}
