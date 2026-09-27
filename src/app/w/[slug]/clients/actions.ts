"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientNameSchema } from "@/lib/validation/client";

export type ClientActionResult = { ok: true } | { ok: false; error: string };

// Matches the SQLSTATE `private.enforce_client_limit()` raises in
// `supabase/migrations/*_billing.sql` — a stable code to branch on instead
// of parsing the trigger's `plan_limit_clients` message text.
const FREE_PLAN_LIMIT_ERROR_CODE = "CD001";

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
