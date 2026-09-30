import { describe, expect, it, vi } from "vitest";
import type { DemoAdminClient } from "./admin";
import { createSandbox, DemoError } from "./sandbox";

const IDS = ["u-owner", "u-member", "u-client1", "u-client2"];

const RPC_RESULT = {
  workspace_id: "w-pro",
  workspace_slug: "northwind-abc123",
  free_workspace_id: "w-free",
  free_workspace_slug: "northwind-labs-def456",
  expires_at: "2026-10-01T10:00:00.000Z",
  files: [
    { from: "tpl/a.png", to: "w-pro/p/f1/a.png" },
    { from: "tpl/b.pdf", to: "w-pro/p/f2/b.pdf" },
  ],
};

type Options = {
  /** What `demo_can_start` answers; "ok" when left out. */
  canStart?: unknown;
  canStartError?: { message: string } | null;
  createUserFailsFor?: string;
  rpcError?: { message: string; code?: string } | null;
  rpcData?: unknown;
  copyFailsFor?: string;
  deleteWorkspacesError?: { message: string } | null;
};

function fakeAdmin(options: Options = {}) {
  const calls: string[] = [];
  let nextUser = 0;

  const createUser = vi.fn(
    (attrs: {
      email: string;
      email_confirm: boolean;
      user_metadata: { full_name: string };
    }) => {
      calls.push("createUser");
      if (options.createUserFailsFor === attrs.user_metadata.full_name) {
        return Promise.resolve({
          data: { user: null },
          error: { message: "boom" },
        });
      }
      const id = IDS[nextUser++];
      return Promise.resolve({
        data: { user: { id, email: attrs.email } },
        error: null,
      });
    },
  );
  const deleteUser = vi.fn((id: string) => {
    calls.push(`deleteUser:${id}`);
    return Promise.resolve({ error: null });
  });
  const rpc = vi.fn((...call: Parameters<DemoAdminClient["rpc"]>) => {
    calls.push(`rpc:${call[0]}`);
    if (call[0] === "demo_can_start") {
      return Promise.resolve({
        data: options.canStartError
          ? null
          : "canStart" in options
            ? options.canStart
            : "ok",
        error: options.canStartError ?? null,
      });
    }
    return Promise.resolve({
      data: options.rpcError ? null : (options.rpcData ?? RPC_RESULT),
      error: options.rpcError ?? null,
    });
  });
  const copy = vi.fn((from: string) => {
    calls.push(`copy:${from}`);
    return Promise.resolve({
      error: options.copyFailsFor === from ? { message: "copy failed" } : null,
    });
  });
  const remove = vi.fn((paths: string[]) => {
    calls.push(`remove:${paths.join(",")}`);
    return Promise.resolve({ error: null });
  });
  const from = vi.fn(() => ({ copy, remove }));
  const deleteWorkspaces = vi.fn((ids: string[]) => {
    calls.push(`deleteWorkspaces:${ids.join(",")}`);
    return Promise.resolve({ error: options.deleteWorkspacesError ?? null });
  });

  const admin: DemoAdminClient = {
    auth: {
      admin: {
        createUser,
        deleteUser,
        generateLink: () => Promise.reject(new Error("unused")),
        getUserById: () => Promise.reject(new Error("unused")),
      },
    },
    rpc,
    storage: { from },
    db: {
      findSandboxByUser: () => Promise.reject(new Error("unused")),
      getWorkspaceSlug: () => Promise.reject(new Error("unused")),
      getMemberRole: () => Promise.reject(new Error("unused")),
      deleteWorkspaces,
    },
  };

  return {
    admin,
    calls,
    spies: {
      createUser,
      deleteUser,
      rpc,
      copy,
      remove,
      from,
      deleteWorkspaces,
    },
  };
}

describe("createSandbox limits pre-check", () => {
  it("asks demo_can_start before it creates any user", async () => {
    const { admin, calls } = fakeAdmin();

    await createSandbox(admin, "hash-1");

    expect(calls[0]).toBe("rpc:demo_can_start");
    expect(calls.indexOf("createUser")).toBeGreaterThan(0);
  });

  it.each([
    ["demo_capacity", "capacity"],
    ["demo_visitor_limit", "visitor_limit"],
  ])(
    "refuses with %s before creating a user, a sandbox or anything to clean up",
    async (answer, code) => {
      const { admin, spies } = fakeAdmin({ canStart: answer });

      await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
        name: "DemoError",
        code,
      });

      expect(spies.createUser).not.toHaveBeenCalled();
      expect(spies.rpc).toHaveBeenCalledTimes(1);
      expect(spies.deleteUser).not.toHaveBeenCalled();
      expect(spies.deleteWorkspaces).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an error", { canStartError: { message: "db down" } }],
    ["an unknown answer", { canStart: "maybe" }],
    ["no answer", { canStart: null }],
  ])("fails closed on %s, without creating a user", async (_name, options) => {
    const { admin, spies } = fakeAdmin(options);

    await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
      code: "failed",
    });

    expect(spies.createUser).not.toHaveBeenCalled();
  });

  it("stays authoritative: create_demo_sandbox still maps its own limit errors", async () => {
    const { admin, spies } = fakeAdmin({
      rpcError: { message: "x", code: "CD006" },
    });

    await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
      code: "capacity",
    });

    expect(spies.createUser).toHaveBeenCalledTimes(4);
  });
});

describe("Sandbox.discard", () => {
  it("removes the workspaces, then the blobs, then the users", async () => {
    const { admin, calls, spies } = fakeAdmin();
    const sandbox = await createSandbox(admin, "hash-1");
    calls.length = 0;

    await sandbox.discard();

    expect(calls.indexOf("deleteWorkspaces:w-pro,w-free")).toBe(0);
    expect(calls[1]).toBe("remove:w-pro/p/f1/a.png,w-pro/p/f2/b.pdf");
    expect(spies.deleteUser).toHaveBeenCalledTimes(4);
  });

  it("never throws, even when every step fails", async () => {
    const { admin, spies } = fakeAdmin({
      deleteWorkspacesError: { message: "nope" },
    });
    const sandbox = await createSandbox(admin, "hash-1");
    spies.deleteUser.mockRejectedValue(new Error("network"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sandbox.discard()).resolves.toBeUndefined();

    log.mockRestore();
  });
});

describe("createSandbox", () => {
  it("creates the four users confirmed, with their names and a demo address", async () => {
    const { admin, spies } = fakeAdmin();

    await createSandbox(admin, "hash-1");

    const attrs = spies.createUser.mock.calls.map(([a]) => a);
    expect(attrs.map((a) => a.user_metadata.full_name).sort()).toEqual([
      "Leo Park",
      "Maya Chen",
      "Priya Nair",
      "Sam Rivera",
    ]);
    for (const a of attrs) {
      expect(a.email_confirm).toBe(true);
      expect(a.email).toMatch(
        /^[a-z0-9-]+-[a-z0-9]{8,}@demo\.clientdesk\.invalid$/,
      );
    }
    expect(new Set(attrs.map((a) => a.email)).size).toBe(4);
  });

  it("passes the user ids in template order, with the visitor hash, to create_demo_sandbox", async () => {
    const { admin, spies } = fakeAdmin();

    await createSandbox(admin, "hash-1");

    expect(spies.rpc).toHaveBeenCalledWith("demo_can_start", {
      p_visitor_hash: "hash-1",
    });
    expect(spies.rpc).toHaveBeenCalledWith("create_demo_sandbox", {
      p_owner: "u-owner",
      p_member: "u-member",
      p_client_one: "u-client1",
      p_client_two: "u-client2",
      p_visitor_hash: "hash-1",
    });
  });

  it("returns the workspace slug and the owner and first client addresses", async () => {
    const { admin, spies } = fakeAdmin();

    const sandbox = await createSandbox(admin, "hash-1");

    const emails = spies.createUser.mock.calls.map(([a]) => a.email);
    expect(sandbox.workspaceSlug).toBe("northwind-abc123");
    expect(sandbox.ownerEmail).toBe(emails[0]);
    expect(sandbox.clientEmail).toBe(emails[2]);
  });

  it("copies every blob in the project-files bucket, all at once", async () => {
    const { admin, spies } = fakeAdmin();
    const started: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    spies.copy.mockImplementation((from: string) => {
      started.push(from);
      return gate.then(() => ({ error: null }));
    });

    const pending = createSandbox(admin, "hash-1");
    await vi.waitFor(() => expect(started).toHaveLength(2));
    release();
    await pending;

    expect(spies.from).toHaveBeenCalledWith("project-files");
    expect(spies.copy).toHaveBeenCalledWith("tpl/a.png", "w-pro/p/f1/a.png");
    expect(spies.copy).toHaveBeenCalledWith("tpl/b.pdf", "w-pro/p/f2/b.pdf");
  });

  it.each([
    ["CD006", "capacity"],
    ["CD007", "visitor_limit"],
    ["CD008", "failed"],
    ["XX000", "failed"],
  ])("maps %s to %s and deletes the four users", async (dbCode, code) => {
    const { admin, spies } = fakeAdmin({
      rpcError: { message: "x", code: dbCode },
    });

    const error = await createSandbox(admin, "hash-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DemoError);
    expect(error).toMatchObject({ code });
    expect(spies.deleteUser.mock.calls.map(([id]) => id).sort()).toEqual(
      [...IDS].sort(),
    );
    expect(spies.deleteWorkspaces).not.toHaveBeenCalled();
    expect(spies.copy).not.toHaveBeenCalled();
  });

  it("deletes the users that were created when one user fails", async () => {
    const { admin, spies } = fakeAdmin({ createUserFailsFor: "Leo Park" });

    await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
      code: "failed",
    });

    expect(spies.deleteUser).toHaveBeenCalledTimes(3);
    expect(spies.rpc).not.toHaveBeenCalledWith(
      "create_demo_sandbox",
      expect.anything(),
    );
  });

  it("removes the workspaces before the users and the copied blobs when a copy fails", async () => {
    const { admin, calls } = fakeAdmin({ copyFailsFor: "tpl/b.pdf" });

    await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
      code: "failed",
    });

    // Deleting a user first would cascade to the last owner's membership and
    // trip protect_last_owner, so the workspaces go first.
    const firstUserDelete = calls.findIndex((c) => c.startsWith("deleteUser"));
    const workspaceDelete = calls.indexOf("deleteWorkspaces:w-pro,w-free");
    expect(workspaceDelete).toBeGreaterThanOrEqual(0);
    expect(workspaceDelete).toBeLessThan(firstUserDelete);
    expect(calls.some((c) => c.startsWith("remove:"))).toBe(true);
  });

  it("cleans up when the function returns something unexpected", async () => {
    const { admin, spies } = fakeAdmin({ rpcData: { nope: true } });

    await expect(createSandbox(admin, "hash-1")).rejects.toMatchObject({
      code: "failed",
    });

    expect(spies.deleteUser).toHaveBeenCalledTimes(4);
  });

  it("still reports the original failure when cleanup fails too", async () => {
    const { admin, spies } = fakeAdmin({
      copyFailsFor: "tpl/a.png",
      deleteWorkspacesError: { message: "cleanup failed" },
    });
    spies.deleteUser.mockRejectedValue(new Error("network"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await createSandbox(admin, "hash-1").catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "failed" });
    expect(String(error instanceof Error && error.message)).toContain(
      "copy failed",
    );

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
