"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoWorkspace } from "@/lib/demo/is-demo-workspace";
import { getEmailSender } from "@/lib/email";
import { env } from "@/lib/env";
import { projectStatusSchema } from "@/lib/validation/project";
import { updateSchema } from "@/lib/validation/update";
import { commentSchema } from "@/lib/validation/comment";
import { fileMetadataSchema } from "@/lib/validation/file";
import {
  parseStoragePath,
  PROJECT_FILES_BUCKET,
} from "@/lib/files/storage-path";

// A Server Action is a public POST endpoint: this shape describes what the
// browser client sends before `fileMetadataSchema` decides whether it is
// actually valid, so a compromised or out-of-date client can't bypass
// re-validation just by changing what it claims the mime type is.
type FileMetadataCandidate = { name: string; size: number; mimeType: string };

const DOWNLOAD_URL_TTL_SECONDS = 60;

export type ActionResult = { ok: true } | { ok: false; error: string };
export type PostUpdateResult =
  { ok: true; warning?: string } | { ok: false; error: string };
export type DownloadUrlResult =
  { ok: true; data: { url: string } } | { ok: false; error: string };

function projectPath(workspaceSlug: string, projectId: string): string {
  return `/w/${workspaceSlug}/projects/${projectId}`;
}

export async function changeStatus(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  // A Server Action is a public POST endpoint, so this is only what the
  // caller claims the status is; `projectStatusSchema` decides whether it
  // is actually one of the values the enum allows.
  status: string,
): Promise<ActionResult> {
  const parsed = projectStatusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Invalid status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: parsed.data })
    .eq("id", projectId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { ok: false, error: "Could not change the project's status" };
  }

  revalidatePath(projectPath(workspaceSlug, projectId));
  return { ok: true };
}

export async function postUpdate(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  formData: FormData,
): Promise<PostUpdateResult> {
  const parsed = updateSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { ok: false, error: "You must be signed in" };
  }

  const { data: update, error: insertError } = await supabase
    .from("project_updates")
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      author_id: claims.claims.sub,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (insertError || !update) {
    return { ok: false, error: "Could not post the update" };
  }

  revalidatePath(projectPath(workspaceSlug, projectId));

  // A sandbox sends no email at all, whoever the recipients are: its users
  // have undeliverable addresses, and the demo must never become a way to
  // mail somebody. `withoutDemoRecipients` filters by domain as well; this
  // check does not rely on the addresses. A failed lookup also sends
  // nothing.
  try {
    if (await isDemoWorkspace(supabase, workspaceId)) {
      return { ok: true };
    }
  } catch (lookupError) {
    console.error("postUpdate action: demo check failed", lookupError);
    return {
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    };
  }

  const { data: recipients, error: recipientsError } = await supabase.rpc(
    "project_update_recipients",
    { p_project_id: projectId },
  );

  if (recipientsError) {
    console.error(
      "postUpdate action: project_update_recipients failed",
      recipientsError,
    );
    return {
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    };
  }

  // The caller's claimed workspace/project names can't be trusted (a Server
  // Action is a public POST endpoint), so the names that go into the email
  // are read here, through the same RLS-scoped client that just posted the
  // update.
  const [
    { data: workspace, error: workspaceError },
    { data: project, error: projectError },
  ] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", workspaceId).single(),
    supabase.from("projects").select("name").eq("id", projectId).single(),
  ]);

  if (workspaceError || !workspace || projectError || !project) {
    console.error(
      "postUpdate action: could not read the workspace or project name",
      workspaceError ?? projectError,
    );
    return {
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    };
  }

  const sender = getEmailSender();
  const projectUrl = `${env.NEXT_PUBLIC_SITE_URL}${projectPath(workspaceSlug, projectId)}`;

  const sendResults = await Promise.allSettled(
    (recipients ?? []).map((to) =>
      sender.sendProjectUpdateEmail({
        to,
        workspaceName: workspace.name,
        projectName: project.name,
        body: parsed.data.body,
        projectUrl,
      }),
    ),
  );

  let failureCount = 0;
  for (const sendResult of sendResults) {
    if (sendResult.status === "rejected") {
      failureCount += 1;
      console.error(
        "postUpdate action: sendProjectUpdateEmail failed",
        sendResult.reason,
      );
    }
  }

  if (failureCount > 0) {
    return {
      ok: true,
      warning: "Update posted, but some emails could not be sent.",
    };
  }

  return { ok: true };
}

export async function postComment(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse({
    updateId: formData.get("updateId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { ok: false, error: "You must be signed in" };
  }

  const { error } = await supabase.from("update_comments").insert({
    workspace_id: workspaceId,
    project_id: projectId,
    update_id: parsed.data.updateId,
    author_id: claims.claims.sub,
    body: parsed.data.body,
  });

  if (error) {
    return { ok: false, error: "Could not post the comment" };
  }

  revalidatePath(projectPath(workspaceSlug, projectId));
  return { ok: true };
}

export async function deleteComment(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  commentId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("update_comments")
    .delete()
    .eq("id", commentId)
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return { ok: false, error: "Could not delete the comment" };
  }

  revalidatePath(projectPath(workspaceSlug, projectId));
  return { ok: true };
}

export async function registerFile(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  storagePath: string,
  metadata: FileMetadataCandidate,
): Promise<ActionResult> {
  const parsed = fileMetadataSchema.safeParse(metadata);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid file",
    };
  }

  const parts = parseStoragePath(storagePath);
  if (
    !parts ||
    parts.workspaceId !== workspaceId ||
    parts.projectId !== projectId
  ) {
    return { ok: false, error: "Invalid file path" };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { ok: false, error: "You must be signed in" };
  }

  // The upload happened straight from the browser, so before trusting the
  // caller's metadata this confirms the object actually landed in the
  // folder the path names.
  const folder = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const { data: objects, error: listError } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .list(folder);

  const objectExists = (objects ?? []).some(
    (object) => object.name === parts.name,
  );
  if (listError || !objectExists) {
    return { ok: false, error: "Upload not found. Try again." };
  }

  const { error: insertError } = await supabase.from("project_files").insert({
    workspace_id: workspaceId,
    project_id: projectId,
    uploaded_by: claims.claims.sub,
    storage_path: storagePath,
    name: parsed.data.name,
    size_bytes: parsed.data.size,
    mime_type: parsed.data.mimeType,
  });

  if (insertError) {
    return { ok: false, error: "Could not save the file" };
  }

  revalidatePath(projectPath(workspaceSlug, projectId));
  return { ok: true };
}

export async function deleteFile(
  workspaceId: string,
  workspaceSlug: string,
  projectId: string,
  fileId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  // Deleting and reading `storage_path` in the same request, scoped to the
  // id/project/workspace the caller named, means the object removed below
  // always comes from the row RLS actually let this caller delete, never
  // from a path the caller supplied.
  const { data: deleted, error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId)
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .select("storage_path")
    .maybeSingle();

  if (error || !deleted) {
    return { ok: false, error: "Could not delete the file" };
  }

  // The row is already gone, which is what access control depends on; a
  // failure to remove the underlying object only wastes storage, so it is
  // logged rather than turned into a user-facing error.
  const { error: removeError } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .remove([deleted.storage_path]);

  if (removeError) {
    console.error("deleteFile action: storage remove failed", removeError);
  }

  revalidatePath(projectPath(workspaceSlug, projectId));
  return { ok: true };
}

export async function getDownloadUrl(
  projectId: string,
  fileId: string,
): Promise<DownloadUrlResult> {
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !file) {
    return { ok: false, error: "File not found" };
  }

  const { data, error: signError } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(file.storage_path, DOWNLOAD_URL_TTL_SECONDS);

  if (signError || !data) {
    return { ok: false, error: "Could not create a download link" };
  }

  return { ok: true, data: { url: data.signedUrl } };
}
