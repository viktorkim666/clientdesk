"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { projectSchema } from "@/lib/validation/project";

export type ProjectActionResult = { ok: true } | { ok: false; error: string };

export async function createProject(
  workspaceId: string,
  workspaceSlug: string,
  formData: FormData,
): Promise<ProjectActionResult> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({
    workspace_id: workspaceId,
    client_id: parsed.data.clientId,
    name: parsed.data.name,
    status: parsed.data.status,
  });

  if (error) {
    return { ok: false, error: "Could not create the project" };
  }

  revalidatePath(`/w/${workspaceSlug}/projects`);
  return { ok: true };
}
