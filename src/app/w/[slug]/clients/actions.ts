"use server";

import { revalidatePath } from "next/cache";
import { isWorkspaceSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { clientNameSchema } from "@/lib/validation/client";

export type ClientActionResult = { ok: true } | { ok: false; error: string };

// Matches the SQLSTATE `private.enforce_client_limit()` raises in
// `supabase/migrations/*_billing.sql` — a stable code to branch on instead
// of parsing the trigger's `plan_limit_clients` message text.
const FREE_PLAN_LIMIT_ERROR_CODE = "CD001";

// A foreign key violation: `projects` and `workspace_members` reference the
// client without a cascade, so the database refuses to delete one that has
// either.
const FOREIGN_KEY_VIOLATION_ERROR_CODE = "23503";

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
    if (error.code === FREE_PLAN_LIMIT_ERROR_CODE) {
      return {
        ok: false,
        error: "The Free plan allows 2 clients. Upgrade to Pro to add more.",
      };
    }
    return { ok: false, error: "Could not create the client" };
  }

  revalidatePath(`/w/${workspaceSlug}/clients`);
  return { ok: true };
}

export async function renameClientCompany(
  workspaceId: string,
  workspaceSlug: string,
  clientId: string,
  formData: FormData,
): Promise<ClientActionResult> {
  const parsed = clientNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // The slug comes from the caller and goes into revalidatePath() below.
  if (!isWorkspaceSlug(workspaceSlug)) {
    return { ok: false, error: "Could not rename this client" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ name: parsed.data.name })
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .select("id");

  // Row level security turns a refused update into zero rows, not an error.
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not rename this client" };
  }

  // The name shows on Projects, Members and the dashboard too, so the whole
  // workspace layout is revalidated, not just the clients page.
  revalidatePath(`/w/${workspaceSlug}`, "layout");
  return { ok: true };
}

export async function deleteClientCompany(
  workspaceId: string,
  workspaceSlug: string,
  clientId: string,
): Promise<ClientActionResult> {
  // The slug comes from the caller and goes into revalidatePath() below.
  if (!isWorkspaceSlug(workspaceSlug)) {
    return { ok: false, error: "Could not delete this client" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .select("id");

  if (error?.code === FOREIGN_KEY_VIOLATION_ERROR_CODE) {
    return {
      ok: false,
      error:
        "This client now has projects or people, so it can't be deleted. Reload the page to see what changed.",
    };
  }
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not delete this client" };
  }

  revalidatePath(`/w/${workspaceSlug}`, "layout");
  return { ok: true };
}
