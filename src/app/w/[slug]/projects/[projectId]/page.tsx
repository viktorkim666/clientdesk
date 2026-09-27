import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { StatusControl } from "./status-control";
import { UpdateForm } from "./update-form";
import { UpdatesList, type UpdateWithComments } from "./updates-list";
import { FileUploader } from "./file-uploader";
import { FileList, type ProjectFileRow } from "./file-list";

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
    .select("id, name, status, clients(name)")
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

  // None of project_updates, update_comments or project_files reference
  // public.profiles directly (their author/uploader columns point at
  // auth.users), so author names come from the same workspace_members ->
  // profiles join the members page uses, keyed by user id.
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, profiles(full_name)")
    .eq("workspace_id", workspace.id);

  const nameByUserId = new Map(
    (members ?? []).map((member) => [
      member.user_id,
      member.profiles?.full_name ?? "Unknown",
    ]),
  );

  const { data: updateRows } = await supabase
    .from("project_updates")
    .select("id, body, created_at, author_id")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const updateIds = (updateRows ?? []).map((update) => update.id);

  type CommentRow = {
    id: string;
    update_id: string;
    body: string;
    created_at: string;
    author_id: string;
  };

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
    authorName: nameByUserId.get(update.author_id) ?? "Unknown",
    comments: (commentsByUpdateId.get(update.id) ?? []).map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      authorId: comment.author_id,
      authorName: nameByUserId.get(comment.author_id) ?? "Unknown",
    })),
  }));

  const { data: fileRows } = await supabase
    .from("project_files")
    .select("id, name, size_bytes, storage_path, uploaded_by")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const files: ProjectFileRow[] = (fileRows ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    sizeBytes: file.size_bytes,
    storagePath: file.storage_path,
    uploadedBy: file.uploaded_by,
    uploaderName: nameByUserId.get(file.uploaded_by) ?? "Unknown",
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/w/${workspace.slug}/projects`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Projects
        </Link>
        <div className="mt-1 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">
              {project.clients?.name ?? "—"}
            </p>
          </div>
          {isStaff ? (
            <StatusControl
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              projectId={project.id}
              status={project.status}
            />
          ) : (
            <Badge
              variant={project.status === "active" ? "default" : "secondary"}
            >
              {project.status.replace("_", " ")}
            </Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Updates</CardTitle>
          <CardDescription>
            The latest 50 updates on this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStaff ? (
            <UpdateForm
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              projectId={project.id}
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
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUploader
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            projectId={project.id}
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
