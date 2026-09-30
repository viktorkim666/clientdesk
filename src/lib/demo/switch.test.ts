import { describe, expect, it, vi } from "vitest";
import type { DemoAdminClient } from "./admin";
import { canSwitchSandboxRole, switchSandboxRole } from "./switch";

const NOW = new Date("2026-09-30T12:00:00.000Z");

type Sandbox = {
  workspace_id: string | null;
  expires_at: string;
  owner_user_id: string;
  member_user_id: string;
  client_one_user_id: string;
  client_two_user_id: string;
};

const SANDBOX: Sandbox = {
  workspace_id: "w-pro",
  expires_at: "2026-10-01T10:00:00.000Z",
  owner_user_id: "u-owner",
  member_user_id: "u-member",
  client_one_user_id: "u-client1",
  client_two_user_id: "u-client2",
};

type Roles = Record<string, "owner" | "member" | "client">;

// Who is still in the sandbox workspace, by user id. Visitors can remove
// members, so a test drops one to see the switch refuse.
const ALL_MEMBERS: Roles = {
  "u-owner": "owner",
  "u-member": "member",
  "u-client1": "client",
  "u-client2": "client",
};

function without(userId: string): Roles {
  return Object.fromEntries(
    Object.entries(ALL_MEMBERS).filter(([id]) => id !== userId),
  );
}

function setup(
  sandbox: Sandbox | null,
  roles: Roles = ALL_MEMBERS,
  memberLookupError: { message: string } | null = null,
) {
  const generateLink = vi.fn((params: { type: "magiclink"; email: string }) =>
    Promise.resolve({
      data: { properties: { hashed_token: `hash-for-${params.email}` } },
      error: null,
    }),
  );
  const getUserById = vi.fn((id: string) =>
    Promise.resolve({
      data: { user: { email: `${id}@demo.clientdesk.invalid` } },
      error: null,
    }),
  );
  const verifyOtp = vi.fn(() => Promise.resolve({ error: null }));
  const admin: DemoAdminClient = {
    auth: {
      admin: {
        generateLink,
        getUserById,
        createUser: () => Promise.reject(new Error("unused")),
        deleteUser: () => Promise.reject(new Error("unused")),
      },
    },
    rpc: () => Promise.reject(new Error("unused")),
    storage: {
      from: () => ({
        copy: () => Promise.reject(new Error("unused")),
        remove: () => Promise.reject(new Error("unused")),
      }),
    },
    db: {
      findSandboxByUser: () => Promise.resolve({ data: sandbox, error: null }),
      getMemberRole: (_workspaceId: string, userId: string) =>
        Promise.resolve({
          data: roles[userId] ? { role: roles[userId] } : null,
          error: memberLookupError,
        }),
      getWorkspaceSlug: () =>
        Promise.resolve({ data: { slug: "northwind-abc123" }, error: null }),
      deleteWorkspaces: () => Promise.reject(new Error("unused")),
    },
  };
  return { admin, server: { auth: { verifyOtp } }, verifyOtp };
}

describe("switchSandboxRole", () => {
  it("signs the owner in as the first client and lands in the workspace", async () => {
    const s = setup(SANDBOX);

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result).toEqual({ ok: true, path: "/w/northwind-abc123" });
    expect(s.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hash-for-u-client1@demo.clientdesk.invalid",
    });
  });

  it("signs the first client in as the owner", async () => {
    const s = setup(SANDBOX);

    const result = await switchSandboxRole(s.admin, s.server, "u-client1", NOW);

    expect(result).toEqual({ ok: true, path: "/w/northwind-abc123" });
    expect(s.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hash-for-u-owner@demo.clientdesk.invalid",
    });
  });

  it("refuses a user that is not in any sandbox", async () => {
    const s = setup(null);

    const result = await switchSandboxRole(s.admin, s.server, "u-real", NOW);

    expect(result.ok).toBe(false);
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses an expired sandbox", async () => {
    const s = setup({ ...SANDBOX, expires_at: "2026-09-30T11:59:59.000Z" });

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/expired/i);
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a sandbox whose workspaces cleanup already deleted", async () => {
    const s = setup({ ...SANDBOX, workspace_id: null });

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toMatch(/expired/i);
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses the sandbox users that have no role to switch to", async () => {
    const s = setup(SANDBOX);

    for (const id of ["u-member", "u-client2"]) {
      const result = await switchSandboxRole(s.admin, s.server, id, NOW);
      expect(result.ok).toBe(false);
    }
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("switchSandboxRole when a member was removed", () => {
  it("tells the owner the client view is gone when Priya was removed", async () => {
    const s = setup(SANDBOX, without("u-client1"));

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "The client in this demo was removed from the workspace, so there is no client view to switch to.",
    });
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("tells the client the agency view is gone when the owner was removed", async () => {
    const s = setup(SANDBOX, without("u-owner"));

    const result = await switchSandboxRole(s.admin, s.server, "u-client1", NOW);

    expect(result).toEqual({
      ok: false,
      error:
        "The agency owner in this demo was removed from the workspace, so there is no agency view to switch to.",
    });
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses when the counterpart is still a member but with another role", async () => {
    const s = setup(SANDBOX, { ...ALL_MEMBERS, "u-client1": "member" });

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result.ok).toBe(false);
    expect(s.verifyOtp).not.toHaveBeenCalled();
  });

  it("fails with the generic message when the membership lookup errors", async () => {
    const s = setup(SANDBOX, ALL_MEMBERS, { message: "db down" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await switchSandboxRole(s.admin, s.server, "u-owner", NOW);

    expect(result).toEqual({
      ok: false,
      error: "Could not switch views. Try again.",
    });
    expect(s.verifyOtp).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("canSwitchSandboxRole", () => {
  it("is true for the owner and the first client while both are in", async () => {
    const s = setup(SANDBOX);

    expect(await canSwitchSandboxRole(s.admin, "u-owner", NOW)).toBe(true);
    expect(await canSwitchSandboxRole(s.admin, "u-client1", NOW)).toBe(true);
  });

  it("is false once the counterpart was removed", async () => {
    const s = setup(SANDBOX, without("u-client1"));

    expect(await canSwitchSandboxRole(s.admin, "u-owner", NOW)).toBe(false);
  });

  it("is false for the sandbox users with no counterpart and for outsiders", async () => {
    const s = setup(SANDBOX);
    expect(await canSwitchSandboxRole(s.admin, "u-member", NOW)).toBe(false);
    expect(await canSwitchSandboxRole(s.admin, "u-client2", NOW)).toBe(false);

    const outside = setup(null);
    expect(await canSwitchSandboxRole(outside.admin, "u-real", NOW)).toBe(
      false,
    );
  });

  it("is false when the lookup fails, without throwing", async () => {
    const s = setup(SANDBOX, ALL_MEMBERS, { message: "db down" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await canSwitchSandboxRole(s.admin, "u-owner", NOW)).toBe(false);
    log.mockRestore();
  });
});
