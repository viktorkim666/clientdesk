"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientNameSchema } from "@/lib/validation/client";

export type ClientActionResult = { ok: true } | { ok: false; error: string };

export async function createClientCompany(
  workspaceId: string,
  workspaceSlug: string,
  formData: FormData,
): Promise<ClientActionResult> {
  const parsed = clientNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .insert({ workspace_id: workspaceId, name: parsed.data.name });

  if (error) {
    return { ok: false, error: "Could not create the client" };
  }

  revalidatePath(`/w/${workspaceSlug}/clients`);
  return { ok: true };
}
