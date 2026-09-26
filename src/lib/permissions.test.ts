import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canInviteRole,
  canRemoveMember,
  isLastOwner,
} from "@/lib/permissions";

describe("canInviteRole", () => {
  it("lets an owner invite any role", () => {
    expect(canInviteRole("owner", "owner")).toBe(true);
    expect(canInviteRole("owner", "member")).toBe(true);
    expect(canInviteRole("owner", "client")).toBe(true);
  });

  it("lets a member invite only a client", () => {
    expect(canInviteRole("member", "client")).toBe(true);
    expect(canInviteRole("member", "member")).toBe(false);
    expect(canInviteRole("member", "owner")).toBe(false);
  });

  it("never lets a client invite anyone", () => {
    expect(canInviteRole("client", "client")).toBe(false);
  });
});

describe("canChangeRole and canRemoveMember", () => {
  it("only an owner can change roles or remove a member", () => {
    expect(canChangeRole("owner")).toBe(true);
    expect(canChangeRole("member")).toBe(false);
    expect(canChangeRole("client")).toBe(false);

    expect(canRemoveMember("owner")).toBe(true);
    expect(canRemoveMember("member")).toBe(false);
  });
});

describe("isLastOwner", () => {
  const owner = { userId: "owner-1", role: "owner" as const };
  const secondOwner = { userId: "owner-2", role: "owner" as const };
  const member = { userId: "member-1", role: "member" as const };

  it("is true for the only owner in the workspace", () => {
    expect(isLastOwner([owner, member], owner.userId)).toBe(true);
  });

  it("is false when another owner exists", () => {
    expect(isLastOwner([owner, secondOwner, member], owner.userId)).toBe(false);
  });

  it("is false for a non-owner", () => {
    expect(isLastOwner([owner, member], member.userId)).toBe(false);
  });
});
