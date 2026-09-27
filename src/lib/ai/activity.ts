import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Real Postgrest errors are Error-like (a `message`) but not `instanceof
// Error`; typing this as `Error` (like `SyncSupabaseClient` in
// `src/lib/billing/sync.ts`) is what satisfies `only-throw-error` below.
type QueryError = Error;

type ProjectRow = {
  name: string;
  status: string;
  clients: { name: string } | null;
  workspace_id: string;
};

type MemberRow = {
  user_id: string;
  profiles: { full_name: string | null } | null;
};

type UpdateRow = { body: string; created_at: string; author_id: string };
type CommentRow = { body: string; created_at: string; author_id: string };
type FileRow = { name: string; created_at: string; uploaded_by: string };

/**
 * The Supabase calls `loadProjectActivity` makes, and nothing else, as a
 * flat method map rather than a `from(table)` builder - one method per
 * query, each with its own concrete argument and return shape, so no
 * caller ever needs a cast to bridge this to or from the real
 * `SupabaseClient<Database>`. The real RLS-scoped server client
 * (`createClient()` in `src/lib/supabase/server.ts`), wrapped by
 * `toActivitySupabaseClient` below, satisfies this; tests build a plain
 * object instead.
 */
export interface ActivitySupabaseClient {
  loadProject: (
    id: string,
  ) => PromiseLike<{ data: ProjectRow | null; error: QueryError | null }>;
  loadMembers: (
    workspaceId: string,
  ) => PromiseLike<{ data: MemberRow[] | null; error: QueryError | null }>;
  loadUpdates: (
    projectId: string,
    sinceIso: string,
    limit: number,
  ) => PromiseLike<{ data: UpdateRow[] | null; error: QueryError | null }>;
  loadComments: (
    projectId: string,
    sinceIso: string,
    limit: number,
  ) => PromiseLike<{ data: CommentRow[] | null; error: QueryError | null }>;
  loadFiles: (
    projectId: string,
    sinceIso: string,
    limit: number,
  ) => PromiseLike<{ data: FileRow[] | null; error: QueryError | null }>;
}

/**
 * Adapts the real RLS-scoped `SupabaseClient` to `ActivitySupabaseClient`.
 * Each method is one concrete `client.from(table).select(...)...` chain,
 * so TypeScript checks it against that table's real generated row type
 * directly - no cast, no `from(table: string)` indirection for the
 * checker to lose track of.
 */
export function toActivitySupabaseClient(
  client: SupabaseClient<Database>,
): ActivitySupabaseClient {
  return {
    loadProject: (id) =>
      client
        .from("projects")
        .select("name, status, clients(name), workspace_id")
        .eq("id", id)
        .maybeSingle(),
    loadMembers: (workspaceId) =>
      client
        .from("workspace_members")
        .select("user_id, profiles(full_name)")
        .eq("workspace_id", workspaceId),
    loadUpdates: (projectId, sinceIso, limit) =>
      client
        .from("project_updates")
        .select("body, created_at, author_id")
        .eq("project_id", projectId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit),
    loadComments: (projectId, sinceIso, limit) =>
      client
        .from("update_comments")
        .select("body, created_at, author_id")
        .eq("project_id", projectId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit),
    loadFiles: (projectId, sinceIso, limit) =>
      client
        .from("project_files")
        .select("name, created_at, uploaded_by")
        .eq("project_id", projectId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit),
  };
}

export type ActivityItem = {
  kind: "update" | "comment" | "file";
  authorName: string;
  createdAt: string;
  text: string;
};

export type ProjectActivity = {
  projectName: string;
  clientName: string | null;
  status: string;
  items: ActivityItem[];
};

// Keeps one busy project from running up the prompt's input cost (the
// plan's "Activity window" decision).
const MAX_ITEMS = 50;
const MAX_CHARS = 12_000;
const TRUNCATION_SUFFIX = "…";

/**
 * Caps `items` (already sorted newest first) to `MAX_ITEMS` entries and
 * `MAX_CHARS` of combined text. The item that would cross the character
 * budget is kept but truncated to what's left, rather than dropped whole,
 * so the draft still sees a version of the most recent event.
 */
function capActivityItems(items: ActivityItem[]): ActivityItem[] {
  const result: ActivityItem[] = [];
  let remainingChars = MAX_CHARS;

  for (const item of items.slice(0, MAX_ITEMS)) {
    if (remainingChars <= 0) {
      break;
    }

    if (item.text.length <= remainingChars) {
      result.push(item);
      remainingChars -= item.text.length;
    } else {
      const keep = Math.max(remainingChars - TRUNCATION_SUFFIX.length, 0);
      result.push({
        ...item,
        text: item.text.slice(0, keep) + TRUNCATION_SUFFIX,
      });
      remainingChars = 0;
    }
  }

  return result;
}

/**
 * Loads the last `since`-to-now activity on a project - updates, comments
 * and file uploads, newest first - for the AI draft prompt (Task 3 of the
 * plan). `supabase` is the caller's RLS-scoped client, so this only ever
 * returns what that caller is already allowed to read.
 */
export async function loadProjectActivity(
  supabase: ActivitySupabaseClient,
  projectId: string,
  since: Date,
): Promise<ProjectActivity> {
  const { data: project, error: projectError } =
    await supabase.loadProject(projectId);
  if (projectError) {
    throw projectError;
  }
  if (!project) {
    throw new Error(`loadProjectActivity: project ${projectId} not found`);
  }

  const sinceIso = since.toISOString();

  // None of project_updates, update_comments or project_files reference
  // public.profiles directly (their author/uploader columns point at
  // auth.users), so author names come from the same workspace_members ->
  // profiles join the project page uses, keyed by user id. Independent of
  // each other and of the project lookup above, so they run concurrently
  // instead of one after another.
  const [
    { data: members, error: membersError },
    { data: updates, error: updatesError },
    { data: comments, error: commentsError },
    { data: files, error: filesError },
  ] = await Promise.all([
    supabase.loadMembers(project.workspace_id),
    supabase.loadUpdates(projectId, sinceIso, MAX_ITEMS),
    supabase.loadComments(projectId, sinceIso, MAX_ITEMS),
    supabase.loadFiles(projectId, sinceIso, MAX_ITEMS),
  ]);
  if (membersError) {
    throw membersError;
  }
  if (updatesError) {
    throw updatesError;
  }
  if (commentsError) {
    throw commentsError;
  }
  if (filesError) {
    throw filesError;
  }

  const nameByUserId = new Map(
    (members ?? []).map((member) => [
      member.user_id,
      member.profiles?.full_name ?? "Unknown",
    ]),
  );

  const items: ActivityItem[] = [
    ...(updates ?? []).map((update) => ({
      kind: "update" as const,
      authorName: nameByUserId.get(update.author_id) ?? "Unknown",
      createdAt: update.created_at,
      text: update.body,
    })),
    ...(comments ?? []).map((comment) => ({
      kind: "comment" as const,
      authorName: nameByUserId.get(comment.author_id) ?? "Unknown",
      createdAt: comment.created_at,
      text: comment.body,
    })),
    ...(files ?? []).map((file) => ({
      kind: "file" as const,
      authorName: nameByUserId.get(file.uploaded_by) ?? "Unknown",
      createdAt: file.created_at,
      text: file.name,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    projectName: project.name,
    clientName: project.clients?.name ?? null,
    status: project.status,
    items: capActivityItems(items),
  };
}
