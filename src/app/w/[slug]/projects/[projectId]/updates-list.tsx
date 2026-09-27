import { CommentForm } from "./comment-form";
import { CommentRow, type CommentRowData } from "./comment-row";

export type UpdateWithComments = {
  id: string;
  body: string;
  createdAt: string;
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
    return <p className="text-sm text-muted-foreground">No updates yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {updates.map((update) => (
        <li key={update.id} className="rounded-lg border p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {update.authorName}
            </span>
            <time dateTime={update.createdAt}>
              {new Date(update.createdAt).toLocaleString()}
            </time>
          </div>
          <p className="mt-2 text-sm whitespace-pre-line">{update.body}</p>
          <ul className="mt-3 space-y-2">
            {update.comments.map((comment) => (
              <CommentRow
                key={comment.id}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                comment={comment}
                canDelete={comment.authorId === currentUserId}
              />
            ))}
          </ul>
          <div className="mt-2">
            <CommentForm
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              updateId={update.id}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
