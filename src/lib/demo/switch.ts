import "server-only";
import type { DemoAdminClient } from "./admin";
import { signInAsDemoUser, type DemoServerClient } from "./sign-in";

export type SwitchResult =
  { ok: true; path: string } | { ok: false; error: string };

type Target =
  | { ok: true; targetId: string; workspaceId: string }
  | { ok: false; error: string };

const NOT_A_SANDBOX = "The role switch only works inside the demo workspace.";
const EXPIRED = "This demo has expired. Start a new one from the home page.";
const FAILED = "Could not switch views. Try again.";
const CLIENT_REMOVED =
  "The client in this demo was removed from the workspace, so there is no client view to switch to.";
const OWNER_REMOVED =
  "The agency owner in this demo was removed from the workspace, so there is no agency view to switch to.";

/**
 * Finds who the current sandbox user would switch to: the owner's
 * counterpart is the first client, the first client's is the owner. Refuses
 * a user who is in no sandbox, a sandbox past its `expires_at` (the cron may
 * not have removed it yet), the two sandbox users that have no counterpart,
 * and a counterpart the visitor removed from the workspace (or gave another
 * role), since signing in as them would land on a page they cannot open. The
 * user ids come from the admin client, because visitors cannot read them.
 */
async function findTarget(
  admin: DemoAdminClient,
  userId: string,
  now: Date,
): Promise<Target> {
  const { data: sandbox, error } = await admin.db.findSandboxByUser(userId);
  if (error) {
    console.error("Demo role switch lookup failed", error.message);
    return { ok: false, error: FAILED };
  }
  if (!sandbox) return { ok: false, error: NOT_A_SANDBOX };
  // No workspace: cleanup already deleted it and the row waits to be
  // finished, so the sandbox is over whatever expires_at says.
  if (
    sandbox.workspace_id === null ||
    new Date(sandbox.expires_at).getTime() <= now.getTime()
  ) {
    return { ok: false, error: EXPIRED };
  }
  const workspaceId = sandbox.workspace_id;

  let targetId: string;
  let targetRole: "owner" | "client";
  let removed: string;
  if (userId === sandbox.owner_user_id) {
    targetId = sandbox.client_one_user_id;
    targetRole = "client";
    removed = CLIENT_REMOVED;
  } else if (userId === sandbox.client_one_user_id) {
    targetId = sandbox.owner_user_id;
    targetRole = "owner";
    removed = OWNER_REMOVED;
  } else {
    return { ok: false, error: NOT_A_SANDBOX };
  }

  const { data: membership, error: membershipError } =
    await admin.db.getMemberRole(workspaceId, targetId);
  if (membershipError) {
    console.error(
      "Demo role switch membership lookup failed",
      membershipError.message,
    );
    return { ok: false, error: FAILED };
  }
  if (membership?.role !== targetRole) return { ok: false, error: removed };

  return { ok: true, targetId, workspaceId };
}

/**
 * Whether the banner should offer the switch: the same checks as the switch
 * itself, so a button is never shown that would only fail.
 */
export async function canSwitchSandboxRole(
  admin: DemoAdminClient,
  userId: string,
  now: Date,
): Promise<boolean> {
  const target = await findTarget(admin, userId, now);
  return target.ok;
}

/** Signs the current sandbox user in as their counterpart. */
export async function switchSandboxRole(
  admin: DemoAdminClient,
  server: DemoServerClient,
  userId: string,
  now: Date,
): Promise<SwitchResult> {
  const target = await findTarget(admin, userId, now);
  if (!target.ok) return target;

  try {
    const [{ data: user }, { data: workspace }] = await Promise.all([
      admin.auth.admin.getUserById(target.targetId),
      admin.db.getWorkspaceSlug(target.workspaceId),
    ]);
    if (!user.user?.email || !workspace) {
      console.error("Demo role switch target not found");
      return { ok: false, error: FAILED };
    }

    await signInAsDemoUser(admin, server, user.user.email);
    return { ok: true, path: `/w/${workspace.slug}` };
  } catch (failure) {
    console.error(
      "Demo role switch failed",
      failure instanceof Error ? failure.message : failure,
    );
    return { ok: false, error: FAILED };
  }
}
