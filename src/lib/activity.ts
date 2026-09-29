import type { Tables } from "@/types/database";

export type ActivityKind = "update" | "comment" | "file";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  projectId: string;
  projectName: string;
  authorName: string;
  createdAt: string;
  fileName?: string;
};

// Feed rows come with their project's name embedded (`projects(name)`).
type WithProject = { projects: { name: string } | null };

export type UpdateRow = Pick<
  Tables<"project_updates">,
  "id" | "project_id" | "author_id" | "created_at"
> &
  WithProject;

export type CommentRow = Pick<
  Tables<"update_comments">,
  "id" | "project_id" | "author_id" | "created_at"
> &
  WithProject;

export type FileRow = Pick<
  Tables<"project_files">,
  "id" | "project_id" | "uploaded_by" | "name" | "created_at"
> &
  WithProject;

export const FEED_LIMIT = 8;

const KIND_RANK: Record<ActivityKind, number> = {
  update: 0,
  comment: 1,
  file: 2,
};

type Entry = { item: ActivityItem; rowId: string; time: number };

const FORMER_MEMBER = "Former member";

// A null id means the account is gone (the FKs are ON DELETE SET NULL). An
// id outside the map is a removed member or a person RLS hides; neither can
// be named.
export function resolveAuthorName(
  authorNames: ReadonlyMap<string, string>,
  id: string | null,
): string {
  return (id === null ? undefined : authorNames.get(id)) ?? FORMER_MEMBER;
}

export function buildActivityFeed({
  updates,
  comments,
  files,
  authorNames,
  limit,
}: {
  updates: UpdateRow[];
  comments: CommentRow[];
  files: FileRow[];
  authorNames: ReadonlyMap<string, string>;
  limit: number;
}): ActivityItem[] {
  const authorName = (id: string | null): string =>
    resolveAuthorName(authorNames, id);
  const projectName = (project: WithProject["projects"]): string =>
    project?.name ?? "Unknown project";
  // An unparsable timestamp sorts after every real one.
  const timeOf = (iso: string): number => {
    const time = new Date(iso).getTime();
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  };

  const entries: Entry[] = [
    ...updates.map((row): Entry => ({
      rowId: row.id,
      time: timeOf(row.created_at),
      item: {
        id: `update-${row.id}`,
        kind: "update",
        projectId: row.project_id,
        projectName: projectName(row.projects),
        authorName: authorName(row.author_id),
        createdAt: row.created_at,
      },
    })),
    ...comments.map((row): Entry => ({
      rowId: row.id,
      time: timeOf(row.created_at),
      item: {
        id: `comment-${row.id}`,
        kind: "comment",
        projectId: row.project_id,
        projectName: projectName(row.projects),
        authorName: authorName(row.author_id),
        createdAt: row.created_at,
      },
    })),
    ...files.map((row): Entry => ({
      rowId: row.id,
      time: timeOf(row.created_at),
      item: {
        id: `file-${row.id}`,
        kind: "file",
        projectId: row.project_id,
        projectName: projectName(row.projects),
        authorName: authorName(row.uploaded_by),
        createdAt: row.created_at,
        fileName: row.name,
      },
    })),
  ];

  // Newest first; equal instants fall back to kind (updates, comments, files)
  // and then row id, so the order never depends on input order. Times are
  // compared, not subtracted, because -Infinity - -Infinity is NaN.
  return entries
    .sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? 1 : -1;
      const kind = KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind];
      if (kind !== 0) return kind;
      if (a.rowId === b.rowId) return 0;
      return a.rowId < b.rowId ? -1 : 1;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
