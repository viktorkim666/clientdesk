import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Where to send a user right after sign-in or sign-up: back to the invite
 * link they arrived from, to their workspace if they already have one, or to
 * onboarding otherwise.
 */
export async function resolvePostAuthRedirect(
  supabase: SupabaseClient<Database>,
  userId: string,
  next?: string | null,
): Promise<string> {
  if (next && next.startsWith("/invite/")) {
    return next;
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return "/onboarding";
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  return workspace ? `/w/${workspace.slug}` : "/onboarding";
}
