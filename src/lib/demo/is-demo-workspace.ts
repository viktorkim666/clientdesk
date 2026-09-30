import { z } from "zod";

/**
 * The one Supabase call `isDemoWorkspace` makes, and nothing else, so tests
 * pass a plain object. The real client structurally satisfies this.
 */
export interface DemoSandboxLookupClient {
  from: (table: "demo_sandboxes") => {
    select: (columns: "id") => {
      or: (filters: string) => {
        limit: (count: number) => {
          maybeSingle: () => PromiseLike<{
            data: { id: string } | null;
            error: Error | null;
          }>;
        };
      };
    };
  };
}

/**
 * True when `workspaceId` is either workspace of a demo sandbox. Runs under
 * the caller's own RLS: `demo_sandboxes` is readable by members of the
 * sandbox only, so a workspace the user is not in reads as "not a sandbox".
 * That is fine for the callers, who act on workspaces the user belongs to.
 *
 * A lookup error throws instead of answering false, so a failed check never
 * lets an invite through inside a sandbox.
 */
export async function isDemoWorkspace(
  client: DemoSandboxLookupClient,
  workspaceId: string,
): Promise<boolean> {
  // The id lands in a PostgREST filter string, so anything that is not a
  // UUID is refused before it can add filters of its own.
  if (!z.uuid().safeParse(workspaceId).success) {
    return false;
  }

  const { data, error } = await client
    .from("demo_sandboxes")
    .select("id")
    .or(`workspace_id.eq.${workspaceId},free_workspace_id.eq.${workspaceId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data !== null;
}
