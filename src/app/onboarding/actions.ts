"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { workspaceNameSchema } from "@/lib/validation/workspace";

export type OnboardingActionState = { ok: true } | { ok: false; error: string };

export async function createWorkspace(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const parsed = workspaceNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: workspace, error } = await supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
  });

  if (error || !workspace) {
    return { ok: false, error: "Could not create the workspace" };
  }

  redirect(`/w/${workspace.slug}`);
}
