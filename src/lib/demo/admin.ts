import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

/** What an admin-client call reports when it fails (`status` is GoTrue's). */
export type Failure = { message: string; code?: string; status?: number };

type RpcResult = PromiseLike<{ data: unknown; error: Failure | null }>;

/**
 * Every admin RPC the demo code calls, with its arguments. A tuple per call
 * (name first) keeps the name and the arguments together for both the
 * callers and the adapter below, without a cast.
 */
export type DemoRpcCall =
  | [
      "create_demo_sandbox",
      {
        p_owner: string;
        p_member: string;
        p_client_one: string;
        p_client_two: string;
        p_visitor_hash: string;
      },
    ]
  | ["demo_can_start", { p_visitor_hash: string }]
  | ["delete_expired_demo_sandboxes"]
  | ["finish_demo_sandbox_cleanup", { p_ids: string[] }];

/**
 * The `demo_sandboxes` columns the role switch reads. `workspace_id` is null
 * once cleanup deleted the workspaces and the row waits to be finished.
 */
export type SandboxRow = {
  workspace_id: string | null;
  expires_at: string;
  owner_user_id: string;
  member_user_id: string;
  client_one_user_id: string;
  client_two_user_id: string;
};

/**
 * The admin-client calls the demo code makes, and nothing else. Tests inject
 * plain objects shaped like this instead of a full `SupabaseClient` (the same
 * idea as `SyncSupabaseClient`). `auth`, `storage` and `rpc` mirror the real
 * client, which satisfies them structurally; `db` holds the three table
 * queries as plain methods, because the real query builder's generated types
 * are too deep to describe as a narrow interface.
 */
export interface DemoAdminClient {
  auth: {
    admin: {
      createUser: (attributes: {
        email: string;
        email_confirm: boolean;
        user_metadata: { full_name: string };
      }) => PromiseLike<{
        data: { user: { id: string; email?: string } | null };
        error: Failure | null;
      }>;
      deleteUser: (id: string) => PromiseLike<{ error: Failure | null }>;
      generateLink: (params: {
        type: "magiclink";
        email: string;
      }) => PromiseLike<{
        data: { properties: { hashed_token: string } | null };
        error: Failure | null;
      }>;
      getUserById: (id: string) => PromiseLike<{
        data: { user: { email?: string } | null };
        error: Failure | null;
      }>;
    };
  };
  rpc: (...call: DemoRpcCall) => RpcResult;
  storage: {
    from: (bucket: string) => {
      copy: (
        from: string,
        to: string,
      ) => PromiseLike<{ error: Failure | null }>;
      remove: (paths: string[]) => PromiseLike<{ error: Failure | null }>;
    };
  };
  db: {
    /** The sandbox a user belongs to, as any of its four users. */
    findSandboxByUser: (
      userId: string,
    ) => PromiseLike<{ data: SandboxRow | null; error: Failure | null }>;
    getWorkspaceSlug: (
      workspaceId: string,
    ) => PromiseLike<{ data: { slug: string } | null; error: Failure | null }>;
    /** A user's role in a workspace, or no row once they were removed. */
    getMemberRole: (
      workspaceId: string,
      userId: string,
    ) => PromiseLike<{
      data: { role: "owner" | "member" | "client" } | null;
      error: Failure | null;
    }>;
    deleteWorkspaces: (
      workspaceIds: string[],
    ) => PromiseLike<{ error: Failure | null }>;
  };
}

/**
 * Adapts the real admin `SupabaseClient` to `DemoAdminClient`. The three
 * table queries are spelled out here so no call site needs a cast.
 */
export function toDemoAdminClient(
  client: SupabaseClient<Database>,
): DemoAdminClient {
  return {
    auth: client.auth,
    rpc: (...call) => {
      switch (call[0]) {
        case "create_demo_sandbox":
          return client.rpc(call[0], call[1]);
        case "demo_can_start":
          return client.rpc(call[0], call[1]);
        case "delete_expired_demo_sandboxes":
          return client.rpc(call[0]);
        case "finish_demo_sandbox_cleanup":
          return client.rpc(call[0], call[1]);
      }
    },
    storage: client.storage,
    db: {
      findSandboxByUser: (userId) => {
        // The id lands in a PostgREST filter string, so anything that is not
        // a UUID is refused before it can add filters of its own. No UUID
        // means no sandbox.
        if (!z.uuid().safeParse(userId).success) {
          return Promise.resolve({ data: null, error: null });
        }
        return client
          .from("demo_sandboxes")
          .select(
            "workspace_id, expires_at, owner_user_id, member_user_id, client_one_user_id, client_two_user_id",
          )
          .or(
            [
              `owner_user_id.eq.${userId}`,
              `member_user_id.eq.${userId}`,
              `client_one_user_id.eq.${userId}`,
              `client_two_user_id.eq.${userId}`,
            ].join(","),
          )
          .maybeSingle();
      },
      getWorkspaceSlug: (workspaceId) =>
        client
          .from("workspaces")
          .select("slug")
          .eq("id", workspaceId)
          .maybeSingle(),
      getMemberRole: (workspaceId, userId) =>
        client
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId)
          .maybeSingle(),
      deleteWorkspaces: (workspaceIds) =>
        client.from("workspaces").delete().in("id", workspaceIds),
    },
  };
}

/**
 * What the cleanup uses of `DemoAdminClient`, and nothing else, so its tests
 * pass plain objects. Derived from `DemoAdminClient`, so the two cannot
 * drift, and any `DemoAdminClient` is one of these.
 */
export type CleanupAdminClient = {
  rpc: DemoAdminClient["rpc"];
  auth: { admin: Pick<DemoAdminClient["auth"]["admin"], "deleteUser"> };
  storage: {
    from: (
      bucket: string,
    ) => Pick<ReturnType<DemoAdminClient["storage"]["from"]>, "remove">;
  };
};
