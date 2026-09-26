"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AcceptInvitationState = { ok: true } | { ok: false; error: string };

export async function acceptInvitation(
  token: string,
  _prevState: AcceptInvitationState,
  _formData: FormData,
): Promise<AcceptInvitationState> {
  // Required by useActionState's (prevState, formData) signature; neither is used here.
  void _prevState;
  void _formData;

  const supabase = await createClient();
  const { data: membership, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error || !membership) {
    return {
      ok: false,
      error: error?.message ?? "This invitation could not be accepted",
    };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  redirect(workspace ? `/w/${workspace.slug}` : "/onboarding");
}
