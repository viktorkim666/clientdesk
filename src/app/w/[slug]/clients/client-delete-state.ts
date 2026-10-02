export type ClientDeleteBlocker = {
  kind: "projects" | "people";
  text: string;
  link: { label: string; page: "projects" | "members" } | null;
};

type InvitationState = { accepted_at: string | null; expires_at: string };

// An invitation that was not accepted and has not expired yet. Only these
// stop working when the client goes; the others are history.
export function pendingInvitationCount(
  invitations: InvitationState[],
  now: Date,
): number {
  return invitations.filter(
    (invitation) =>
      invitation.accepted_at === null &&
      new Date(invitation.expires_at).getTime() > now.getTime(),
  ).length;
}

// Why a client cannot be deleted yet, in the order the user has to act:
// projects first, then people. Invitations never block.
export function clientDeleteBlockers({
  name,
  projectCount,
  peopleCount,
  viewerRole,
}: {
  name: string;
  projectCount: number;
  peopleCount: number;
  viewerRole: "owner" | "member";
}): ClientDeleteBlocker[] {
  const blockers: ClientDeleteBlocker[] = [];

  if (projectCount > 0) {
    blockers.push({
      kind: "projects",
      text:
        projectCount === 1
          ? `${name} has 1 project. Delete it first, then delete the client.`
          : `${name} has ${projectCount} projects. Delete them first, then delete the client.`,
      link: { label: "Open Projects", page: "projects" },
    });
  }

  if (peopleCount > 0) {
    const count =
      peopleCount === 1
        ? "1 person signs in as this client."
        : `${peopleCount} people sign in as this client.`;
    const isOwner = viewerRole === "owner";
    blockers.push({
      kind: "people",
      text: isOwner
        ? `${count} Remove them in Settings > Members first.`
        : `${count} Only a workspace owner can remove them in Settings > Members.`,
      link: isOwner ? { label: "Open Members", page: "members" } : null,
    });
  }

  return blockers;
}
