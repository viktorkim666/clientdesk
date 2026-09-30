import "server-only";
import { z } from "zod";
import type { DemoAdminClient } from "./admin";
import { DEMO_EMAIL_DOMAIN } from "./email-domain";

const BUCKET = "project-files";

/**
 * Why a sandbox could not be created. `capacity` and `visitor_limit` come
 * from `create_demo_sandbox` (CD006, CD007) and get their own visitor
 * message; everything else is `failed`.
 */
export class DemoError extends Error {
  constructor(
    readonly code: "capacity" | "visitor_limit" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "DemoError";
  }
}

// The four template users, in the order create_demo_sandbox takes them.
const USERS = [
  { key: "owner", fullName: "Maya Chen" },
  { key: "member", fullName: "Leo Park" },
  { key: "client1", fullName: "Priya Nair" },
  { key: "client2", fullName: "Sam Rivera" },
] as const;

const sandboxResultSchema = z.object({
  workspace_id: z.string(),
  workspace_slug: z.string(),
  free_workspace_id: z.string(),
  free_workspace_slug: z.string(),
  expires_at: z.string(),
  files: z.array(z.object({ from: z.string(), to: z.string() })),
});

export type Sandbox = {
  workspaceSlug: string;
  ownerEmail: string;
  clientEmail: string;
  /**
   * Deletes the sandbox again: for the caller that created it but could not
   * hand it to the visitor (signing in failed). Never throws; a step that
   * fails is logged, and the expiry cron removes what is left.
   */
  discard: () => Promise<void>;
};

/** What `demo_can_start` may answer. Anything else is treated as a failure. */
const canStartSchema = z.enum(["ok", "demo_capacity", "demo_visitor_limit"]);

function randomId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Deletes what a failed creation left behind. The workspaces go first:
 * deleting a user cascades to their membership, and `protect_last_owner`
 * refuses to remove the last owner of a workspace that still exists. Each
 * step runs on its own and only logs, so a failed cleanup never hides the
 * error that caused it. What is left over is users with no data, which the
 * cron's stray-user sweep deletes once they are 25 hours old, and at most a
 * registry row without workspaces, which the cron finishes once it expires.
 */
async function cleanUp(
  admin: DemoAdminClient,
  created: {
    userIds: string[];
    workspaceIds: string[];
    blobPaths: string[];
  },
) {
  const steps: [
    string,
    () => PromiseLike<{ error: { message: string } | null }>,
  ][] = [];

  if (created.workspaceIds.length > 0) {
    steps.push([
      "workspaces",
      () => admin.db.deleteWorkspaces(created.workspaceIds),
    ]);
  }
  if (created.blobPaths.length > 0) {
    steps.push([
      "blobs",
      () => admin.storage.from(BUCKET).remove(created.blobPaths),
    ]);
  }

  // Workspaces before users; blobs are independent of both.
  for (const [what, run] of steps) {
    try {
      const { error } = await run();
      if (error) console.error(`Demo cleanup of ${what} failed`, error.message);
    } catch (error) {
      console.error(`Demo cleanup of ${what} failed`, describe(error));
    }
  }

  const results = await Promise.allSettled(
    created.userIds.map((id) => admin.auth.admin.deleteUser(id)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Demo cleanup of a user failed", describe(result.reason));
    } else if (result.value.error) {
      console.error(
        "Demo cleanup of a user failed",
        result.value.error.message,
      );
    }
  }
}

/**
 * Asks the database whether a sandbox may be created for this visitor before
 * anything is created, so a request that is going to be refused (a bot loop)
 * costs one cheap read instead of four users created and deleted again.
 * `create_demo_sandbox` checks again under its lock and stays the authority.
 * A failed or unclear answer refuses the request: the check exists to
 * protect the database.
 */
async function assertCanStart(admin: DemoAdminClient, visitorHash: string) {
  const { data, error } = await admin.rpc("demo_can_start", {
    p_visitor_hash: visitorHash,
  });
  if (error) {
    throw new DemoError("failed", `demo_can_start failed: ${error.message}`);
  }

  const answer = canStartSchema.safeParse(data);
  if (!answer.success) {
    throw new DemoError(
      "failed",
      "demo_can_start returned an unexpected value",
    );
  }
  if (answer.data === "demo_capacity") {
    throw new DemoError("capacity", answer.data);
  }
  if (answer.data === "demo_visitor_limit") {
    throw new DemoError("visitor_limit", answer.data);
  }
}

/**
 * Creates one private sandbox: four confirmed users on the reserved demo
 * domain, the cloned workspaces (`create_demo_sandbox`, which also enforces
 * the caps) and copies of the template blobs. The limits are checked first
 * (`demo_can_start`), before any user exists. If any step fails, everything
 * created so far is deleted and a `DemoError` is thrown.
 */
export async function createSandbox(
  admin: DemoAdminClient,
  visitorHash: string,
): Promise<Sandbox> {
  await assertCanStart(admin, visitorHash);

  const created = {
    userIds: [] as string[],
    workspaceIds: [] as string[],
    blobPaths: [] as string[],
  };

  try {
    const users = await Promise.allSettled(
      USERS.map(async ({ key, fullName }) => {
        const email = `${key}-${randomId()}@${DEMO_EMAIL_DOMAIN}`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error || !data.user) {
          throw new Error(`Could not create ${key}: ${error?.message}`);
        }
        created.userIds.push(data.user.id);
        return { id: data.user.id, email };
      }),
    );

    const failedUser = users.find((result) => result.status === "rejected");
    if (failedUser) throw failedUser.reason;
    const [owner, member, client1, client2] = users.map((result) =>
      result.status === "fulfilled" ? result.value : null,
    );
    if (!owner || !member || !client1 || !client2) {
      throw new Error("Could not create every user");
    }

    const { data, error } = await admin.rpc("create_demo_sandbox", {
      p_owner: owner.id,
      p_member: member.id,
      p_client_one: client1.id,
      p_client_two: client2.id,
      p_visitor_hash: visitorHash,
    });
    if (error) {
      if (error.code === "CD006") {
        throw new DemoError("capacity", error.message);
      }
      if (error.code === "CD007") {
        throw new DemoError("visitor_limit", error.message);
      }
      throw new Error(`create_demo_sandbox failed: ${error.message}`);
    }

    const parsed = sandboxResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("create_demo_sandbox returned an unexpected result");
    }
    const sandbox = parsed.data;
    created.workspaceIds.push(sandbox.workspace_id, sandbox.free_workspace_id);
    created.blobPaths.push(...sandbox.files.map((file) => file.to));

    const copies = await Promise.allSettled(
      sandbox.files.map(async (file) => {
        const { error: copyError } = await admin.storage
          .from(BUCKET)
          .copy(file.from, file.to);
        if (copyError) {
          throw new Error(`Could not copy ${file.from}: ${copyError.message}`);
        }
      }),
    );
    const failedCopy = copies.find((result) => result.status === "rejected");
    if (failedCopy) throw failedCopy.reason;

    return {
      workspaceSlug: sandbox.workspace_slug,
      ownerEmail: owner.email,
      clientEmail: client1.email,
      discard: () => cleanUp(admin, created),
    };
  } catch (error) {
    await cleanUp(admin, created);
    if (error instanceof DemoError) throw error;
    throw new DemoError("failed", describe(error));
  }
}
