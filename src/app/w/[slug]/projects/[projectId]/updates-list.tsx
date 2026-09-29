import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { CommentForm } from "./comment-form";
import { CommentRow, type CommentRowData } from "./comment-row";

export type UpdateWithComments = {
  id: string;
  body: string;
  createdAt: string;
  createdLabel: string;
  createdTitle: string;
  authorName: string;
  comments: CommentRowData[];
};

export function UpdatesList({
  workspaceId,
  workspaceSlug,
  projectId,
  updates,
  currentUserId,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  updates: UpdateWithComments[];
  currentUserId: string;
}) {
  if (updates.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No updates yet"
        description="Updates from the team will appear here."
      />
    );
  }

  return (
    <ul className="space-y-6">
      {updates.map((update) => (
        <li key={update.id} className="flex gap-3">
          <UserAvatar name={update.authorName} className="mt-0.5" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{update.authorName}</span>
                <time
                  dateTime={update.createdAt}
                  title={update.createdTitle}
                  className="text-xs text-muted-foreground"
                >
                  {update.createdLabel}
                </time>
              </div>
              <p className="mt-1 text-sm whitespace-pre-line">{update.body}</p>
            </div>
            <div className="space-y-3 border-l-2 pl-4">
              {update.comments.length > 0 ? (
                <ul className="space-y-3">
                  {update.comments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      workspaceId={workspaceId}
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      updateId={update.id}
                      comment={comment}
                      canDelete={comment.authorId === currentUserId}
                    />
                  ))}
                </ul>
              ) : null}
              <CommentForm
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                updateId={update.id}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
