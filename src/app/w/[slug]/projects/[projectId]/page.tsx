import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { CompanyAvatar } from "@/components/company-avatar";
import { resolveAuthorName } from "@/lib/activity";
import { formatDate, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { getDraftGenerator } from "@/lib/ai";
import { planFromStatus } from "@/lib/billing/plan";
import { StatusControl } from "./status-control";
import { UpdateForm } from "./update-form";
import { UpdatesList, type UpdateWithComments } from "./updates-list";
import { FileUploader } from "./file-uploader";
import { FILES_HEADING_ID, FileList, type ProjectFileRow } from "./file-list";
import { DeleteProjectDialog } from "./delete-project-dialog";

// A non-UUID `projectId` makes Postgres raise "invalid input syntax for
// type uuid" (SQLSTATE 22P02) on the `.eq("id", projectId)` comparison
// below; that and RLS returning no row both mean "this project isn't
// available to you", so both become a 404 instead of a crash.
const INVALID_UUID_SQLSTATE = "22P02";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, status, created_at, clients(name)")
    .eq("id", projectId)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (projectError && projectError.code !== INVALID_UUID_SQLSTATE) {
    throw projectError;
  }
  if (!project) {
    notFound();
  }

  const isStaff = workspace.role === "owner" || workspace.role === "member";

  // Only staff see the draft button, so the billing lookup below runs only
  // for them - a client's page load doesn't pay for a query it can't use.
  // None of these queries depend on each other's results - billing and
  // members need only workspace.id, updates and files need only
  // project.id - so all five run concurrently instead of one after another.
  const billingQuery = isStaff
    ? supabase
        .from("workspace_billing")
        .select("subscription_status")
        .eq("workspace_id", workspace.id)
        .maybeSingle()
    : null;

  // None of project_updates, update_comments or project_files reference
  // public.profiles directly (their author/uploader columns point at
  // auth.users), so author names come from the same workspace_members ->
  // profiles join the members page uses, keyed by user id.
  const membersQuery = supabase
    .from("workspace_members")
    .select("user_id, profiles(full_name)")
    .eq("workspace_id", workspace.id);

  const updatesQuery = supabase
    .from("project_updates")
    .select("id, body, created_at, author_id")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const filesQuery = supabase
    .from("project_files")
    .select(
      "id, name, size_bytes, storage_path, uploaded_by, mime_type, created_at",
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // How many of a sandbox's 5 uploads are used, or null outside a sandbox.
  // The function reads the ledger the database counts against (RLS on
  // project_files would show a client only the files they can read, and a
  // deleted file would look like a free slot), so the hint matches the
  // limit the trigger enforces. The generated type says `number`, but the
  // function also returns null (a non-member, or a workspace outside a
  // sandbox) and the generator cannot express that; the uploader's prop type
  // `number | null` is the honest one.
  const demoUploadsQuery = supabase.rpc("demo_uploads_used", {
    p_workspace_id: workspace.id,
  });

  // What deleting the project would remove, for the confirmation text. The
  // lists above are capped (50 updates, 100 files) and the comments are only
  // read for those updates, so the totals come from head-only counts. Only
  // staff can delete, so only staff pay for them.
  const countQuery = (
    table: "project_updates" | "update_comments" | "project_files",
  ) =>
    isStaff
      ? supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
      : null;

  const [
    billingResult,
    { data: members },
    { data: updateRows },
    { data: fileRows },
    { data: demoUploadsUsed, error: demoUploadsError },
    updateCountResult,
    commentCountResult,
    fileCountResult,
  ] = await Promise.all([
    billingQuery,
    membersQuery,
    updatesQuery,
    filesQuery,
    demoUploadsQuery,
    countQuery("project_updates"),
    countQuery("update_comments"),
    countQuery("project_files"),
  ]);

  if (demoUploadsError) {
    throw demoUploadsError;
  }
  // A wrong zero would tell the user a project is empty, so a failed count
  // fails the page instead.
  for (const countResult of [
    updateCountResult,
    commentCountResult,
    fileCountResult,
  ]) {
    if (countResult?.error) {
      throw countResult.error;
    }
  }

  let plan: ReturnType<typeof planFromStatus> = "free";
  let aiConfigured = false;
  if (isStaff) {
    plan = planFromStatus(billingResult?.data?.subscription_status ?? null);
    aiConfigured = getDraftGenerator() !== null;
  }

  const nameByUserId = new Map(
    (members ?? []).map((member) => [
      member.user_id,
      member.profiles?.full_name ?? "Unnamed",
    ]),
  );

  // One `now` for the whole page keeps every relative time consistent.
  const now = new Date();

  const updateIds = (updateRows ?? []).map((update) => update.id);

  type CommentRow = {
    id: string;
    update_id: string;
    body: string;
    created_at: string;
    author_id: string | null;
  };

  const authorName = (authorId: string | null): string =>
    resolveAuthorName(nameByUserId, authorId);

  const commentRows: CommentRow[] =
    updateIds.length > 0
      ? ((
          await supabase
            .from("update_comments")
            .select("id, update_id, body, created_at, author_id")
            .in("update_id", updateIds)
            .order("created_at", { ascending: true })
        ).data ?? [])
      : [];

  const commentsByUpdateId = new Map<string, CommentRow[]>();
  for (const comment of commentRows) {
    const list = commentsByUpdateId.get(comment.update_id) ?? [];
    list.push(comment);
    commentsByUpdateId.set(comment.update_id, list);
  }

  const updates: UpdateWithComments[] = (updateRows ?? []).map((update) => ({
    id: update.id,
    body: update.body,
    createdAt: update.created_at,
    createdLabel: formatRelative(update.created_at, now),
    createdTitle: formatDate(update.created_at),
    authorName: authorName(update.author_id),
    comments: (commentsByUpdateId.get(update.id) ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      createdLabel: formatRelative(comment.created_at, now),
      createdTitle: formatDate(comment.created_at),
      authorId: comment.author_id,
      authorName: authorName(comment.author_id),
    })),
  }));

  const files: ProjectFileRow[] = (fileRows ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    sizeBytes: file.size_bytes,
    storagePath: file.storage_path,
    uploadedBy: file.uploaded_by,
    uploaderName: authorName(file.uploaded_by),
    mimeType: file.mime_type,
    createdAt: file.created_at,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/w/${workspace.slug}/projects`}
            className="inline-flex min-h-7 items-center gap-1 text-sm text-muted-foreground hover:underline max-sm:min-h-11"
          >
            <span aria-hidden="true">←</span> Projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {project.clients ? (
              <span className="flex items-center gap-1.5">
                <CompanyAvatar size="sm" />
                {project.clients.name}
              </span>
            ) : (
              <span>—</span>
            )}
            <span aria-hidden="true">·</span>
            <span>Created {formatDate(project.created_at)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {isStaff ? (
            <>
              <StatusControl
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                projectId={project.id}
                status={project.status}
              />
              <DeleteProjectDialog
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                projectId={project.id}
                projectName={project.name}
                clientName={project.clients?.name ?? null}
                counts={{
                  updates: updateCountResult?.count ?? 0,
                  comments: commentCountResult?.count ?? 0,
                  files: fileCountResult?.count ?? 0,
                }}
              />
            </>
          ) : (
            <StatusBadge status={project.status} />
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>Updates</CardTitle>
          <CardDescription>
            What the team shared with the client, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStaff ? (
            <UpdateForm
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              projectId={project.id}
              plan={plan}
              aiConfigured={aiConfigured}
            />
          ) : null}
          <UpdatesList
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            projectId={project.id}
            updates={updates}
            currentUserId={workspace.userId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 id={FILES_HEADING_ID} tabIndex={-1} />}>
            Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUploader
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            projectId={project.id}
            demoUploadsUsed={demoUploadsUsed}
          />
          <FileList
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            projectId={project.id}
            files={files}
            currentUserId={workspace.userId}
            isStaff={isStaff}
          />
        </CardContent>
      </Card>
    </div>
  );
}
