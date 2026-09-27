import { cache } from "react";
import { notFound } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  clientId: string | null;
  userId: string;
};

/**
 * Resolves the signed-in user's membership in the workspace at `slug`.
 * 404s for a signed-out visitor, an unknown slug, or a workspace the caller
 * isn't a member of — RLS already hides the row, this just turns "no row"
 * into the right page instead of an empty dashboard.
 *
 * The layout and the page under it both call this for the same request, so
 * it's wrapped in `cache()` below to dedupe the two lookups. `cache()` only
 * memoizes while called during a render (it dedupes by the exact `supabase`
 * and `slug` arguments passed in); called directly, as the tests here do, it
 * just runs the function again - nothing to reset between tests.
 */
async function getCurrentWorkspaceUncached(
  supabase: SupabaseServerClient,
  slug: string,
): Promise<CurrentWorkspace> {
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    notFound();
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (workspaceError) {
    throw workspaceError;
  }
  if (!workspace) {
    notFound();
  }

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role, client_id")
    .eq("workspace_id", workspace.id)
    .eq("user_id", claims.claims.sub)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }
  if (!membership) {
    notFound();
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role: membership.role,
    clientId: membership.client_id,
    userId: claims.claims.sub,
  };
}

export const getCurrentWorkspace = cache(getCurrentWorkspaceUncached);
