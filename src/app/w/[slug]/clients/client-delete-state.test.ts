import { describe, expect, it } from "vitest";
import {
  clientDeleteBlockers,
  pendingInvitationCount,
} from "./client-delete-state";

describe("pendingInvitationCount", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("counts invitations that are neither accepted nor expired", () => {
    expect(
      pendingInvitationCount(
        [
          { accepted_at: null, expires_at: "2026-10-09T12:00:00Z" },
          { accepted_at: null, expires_at: "2026-10-02T12:00:01Z" },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("ignores accepted invitations", () => {
    expect(
      pendingInvitationCount(
        [
          {
            accepted_at: "2026-10-01T09:00:00Z",
            expires_at: "2026-10-09T12:00:00Z",
          },
        ],
        now,
      ),
    ).toBe(0);
  });

  it("ignores expired invitations, including one that expires right now", () => {
    expect(
      pendingInvitationCount(
        [
          { accepted_at: null, expires_at: "2026-10-01T12:00:00Z" },
          { accepted_at: null, expires_at: "2026-10-02T12:00:00Z" },
        ],
        now,
      ),
    ).toBe(0);
  });

  it("is zero for no invitations", () => {
    expect(pendingInvitationCount([], now)).toBe(0);
  });
});

describe("clientDeleteBlockers", () => {
  const base = {
    name: "Acme Co.",
    projectCount: 0,
    peopleCount: 0,
    viewerRole: "owner" as const,
  };

  it("has no blockers when the client has no projects and no people", () => {
    expect(clientDeleteBlockers(base)).toEqual([]);
  });

  it("tells the user to delete the client's projects first", () => {
    const [blocker] = clientDeleteBlockers({ ...base, projectCount: 3 });

    expect(blocker.text).toBe(
      "Acme Co. has 3 projects. Delete them first, then delete the client.",
    );
  });

  it("uses the singular for one project", () => {
    const [blocker] = clientDeleteBlockers({ ...base, projectCount: 1 });

    expect(blocker.text).toBe(
      "Acme Co. has 1 project. Delete it first, then delete the client.",
    );
  });

  it("links to the Projects page", () => {
    const [blocker] = clientDeleteBlockers({ ...base, projectCount: 2 });

    expect(blocker.link).toEqual({ label: "Open Projects", page: "projects" });
  });

  it("tells an owner where to remove the people, with a link", () => {
    const [blocker] = clientDeleteBlockers({ ...base, peopleCount: 2 });

    expect(blocker.text).toBe(
      "2 people sign in as this client. Remove them in Settings > Members first.",
    );
    expect(blocker.link).toEqual({ label: "Open Members", page: "members" });
  });

  it("uses the singular for one person", () => {
    const [blocker] = clientDeleteBlockers({ ...base, peopleCount: 1 });

    expect(blocker.text).toBe(
      "1 person signs in as this client. Remove them in Settings > Members first.",
    );
  });

  it("tells a member to ask an owner, without a link", () => {
    const [blocker] = clientDeleteBlockers({
      ...base,
      peopleCount: 2,
      viewerRole: "member",
    });

    expect(blocker.text).toBe(
      "2 people sign in as this client. Only a workspace owner can remove them in Settings > Members.",
    );
    expect(blocker.link).toBeNull();
  });

  it("lists both reasons in the order projects, people", () => {
    const blockers = clientDeleteBlockers({
      ...base,
      projectCount: 1,
      peopleCount: 1,
    });

    expect(blockers.map((blocker) => blocker.kind)).toEqual([
      "projects",
      "people",
    ]);
  });
});
