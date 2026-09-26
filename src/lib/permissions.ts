import type { WorkspaceRole } from "@/lib/validation/invitation";

/**
 * Mirrors the invitations RLS policy: an owner invites any role; a member
 * invites clients only. These are UI-only hints for hiding controls — RLS
 * does the actual filtering, matching every server action in this codebase.
 */
export function canInviteRole(
  inviterRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (inviterRole === "owner") return true;
  if (inviterRole === "member") return targetRole === "client";
  return false;
}

/** Mirrors the workspace_members update/delete policies: owner only. */
export function canChangeRole(actingRole: WorkspaceRole): boolean {
  return actingRole === "owner";
}

export function canRemoveMember(actingRole: WorkspaceRole): boolean {
  return actingRole === "owner";
}

/** Mirrors private.protect_last_owner(): true if removing/demoting userId would leave no owner. */
export function isLastOwner(
  members: { userId: string; role: WorkspaceRole }[],
  userId: string,
): boolean {
  const target = members.find((member) => member.userId === userId);
  if (!target || target.role !== "owner") {
    return false;
  }
  const remainingOwners = members.filter(
    (member) => member.role === "owner" && member.userId !== userId,
  );
  return remainingOwners.length === 0;
}
