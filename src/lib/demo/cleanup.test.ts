import { describe, expect, it, vi } from "vitest";
import type { CleanupAdminClient } from "@/lib/demo/admin";
import {
  cleanupExpiredDemos,
  type CleanupStripeClient,
} from "@/lib/demo/cleanup";

type Failure = { message: string; status?: number };
type RpcResult = { data: unknown; error: Failure | null };

type SandboxPart = {
  id: string;
  user_ids: string[];
  storage_paths: string[];
  stripe_customer_ids: string[];
};

function sandbox(id: string, part: Partial<SandboxPart> = {}): SandboxPart {
  return {
    id,
    user_ids: [`${id}-owner`, `${id}-member`],
    storage_paths: [`${id}/p/f1/a.png`],
    stripe_customer_ids: [],
    ...part,
  };
}

function batch(
  sandboxes: SandboxPart[],
  extra: { orphans?: string[]; drafts?: number } = {},
): RpcResult {
  return {
    data: {
      sandboxes,
      orphan_user_ids: extra.orphans ?? [],
      draft_requests_deleted: extra.drafts ?? 0,
    },
    error: null,
  };
}

const EMPTY = batch([]);

function setup(
  overrides: {
    /** One entry per `delete_expired_demo_sandboxes` call; then empty. */
    rounds?: RpcResult[];
    finish?: (ids: string[]) => RpcResult | Promise<RpcResult>;
    deleteUser?: (id: string) => { error: Failure | null } | Promise<never>;
    remove?: (paths: string[]) => { error: Failure | null } | Promise<never>;
    delCustomer?: (id: string) => Promise<unknown>;
  } = {},
) {
  const rounds = [...(overrides.rounds ?? [])];
  const rpc = vi.fn((...call: Parameters<CleanupAdminClient["rpc"]>) => {
    if (call[0] === "finish_demo_sandbox_cleanup") {
      const ids = call[1].p_ids;
      return Promise.resolve(
        overrides.finish?.(ids) ?? { data: ids.length, error: null },
      );
    }
    return Promise.resolve(rounds.shift() ?? EMPTY);
  });
  const deleteUser = vi.fn((id: string) =>
    Promise.resolve(overrides.deleteUser?.(id) ?? { error: null }),
  );
  const remove = vi.fn((paths: string[]) =>
    Promise.resolve(overrides.remove?.(paths) ?? { error: null }),
  );
  const from = vi.fn((bucket: string) => {
    void bucket;
    return { remove };
  });
  const admin: CleanupAdminClient = {
    rpc,
    auth: { admin: { deleteUser } },
    storage: { from },
  };
  const del = vi.fn((id: string) =>
    overrides.delCustomer
      ? overrides.delCustomer(id)
      : Promise.resolve({ id, deleted: true }),
  );
  const stripe: CleanupStripeClient = { customers: { del } };

  const finishedIds = () =>
    rpc.mock.calls.flatMap((call) =>
      call[0] === "finish_demo_sandbox_cleanup" ? call[1].p_ids : [],
    );
  const deleteCalls = () =>
    rpc.mock.calls.filter(
      (call) => call[0] === "delete_expired_demo_sandboxes",
    );
  return {
    admin,
    stripe,
    rpc,
    deleteUser,
    remove,
    from,
    del,
    finishedIds,
    deleteCalls,
  };
}

function silenceErrors() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

const TWO_SANDBOXES = batch(
  [
    sandbox("s1", { stripe_customer_ids: ["cus_1"] }),
    sandbox("s2", { stripe_customer_ids: ["cus_2"] }),
  ],
  { drafts: 4 },
);

describe("cleanupExpiredDemos", () => {
  it("deletes users, blobs and Stripe customers, finishes the sandboxes and reports counts", async () => {
    const { admin, stripe, rpc, deleteUser, remove, from, del, finishedIds } =
      setup({ rounds: [TWO_SANDBOXES] });

    const result = await cleanupExpiredDemos({ admin, stripe });

    expect(rpc).toHaveBeenCalledWith("delete_expired_demo_sandboxes");
    expect(deleteUser.mock.calls.map(([id]) => id).sort()).toEqual([
      "s1-member",
      "s1-owner",
      "s2-member",
      "s2-owner",
    ]);
    expect(from).toHaveBeenCalledWith("project-files");
    expect(remove).toHaveBeenCalledExactlyOnceWith([
      "s1/p/f1/a.png",
      "s2/p/f1/a.png",
    ]);
    expect(del.mock.calls.map(([id]) => id).sort()).toEqual(["cus_1", "cus_2"]);
    expect(rpc).toHaveBeenCalledWith("finish_demo_sandbox_cleanup", {
      p_ids: ["s1", "s2"],
    });
    expect(finishedIds()).toEqual(["s1", "s2"]);
    expect(result).toEqual({
      ok: true,
      rounds: 1,
      sandboxesFinished: 2,
      sandboxesPending: 0,
      draftRequestsDeleted: 4,
      usersDeleted: 4,
      storageObjectsRemoved: 2,
      stripeCustomersDeleted: 2,
      stripeCustomersSkipped: 0,
      failures: {
        database: null,
        finish: null,
        users: [],
        storageBatches: 0,
        stripeCustomers: [],
      },
    });
  });

  it("does nothing else, and finishes nothing, when nothing expired", async () => {
    const { admin, stripe, rpc, deleteUser, remove, del } = setup({
      rounds: [EMPTY],
    });

    const result = await cleanupExpiredDemos({ admin, stripe });

    expect(result.ok).toBe(true);
    expect(result.rounds).toBe(1);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("removes storage paths in batches of 100 across sandboxes", async () => {
    const paths = (id: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${id}/p/f${i}/x.png`);
    const { admin, stripe, remove } = setup({
      rounds: [
        batch([
          sandbox("s1", { storage_paths: paths("s1", 150) }),
          sandbox("s2", { storage_paths: paths("s2", 100) }),
        ]),
      ],
    });

    const result = await cleanupExpiredDemos({ admin, stripe });

    expect(remove.mock.calls.map(([b]) => b.length)).toEqual([100, 100, 50]);
    expect(result.storageObjectsRemoved).toBe(250);
  });

  it("deletes users in parallel chunks, not one by one and not all at once", async () => {
    const users = Array.from({ length: 40 }, (_, i) => `u${i}`);
    let running = 0;
    let peak = 0;
    const { admin, stripe, deleteUser } = setup({
      rounds: [batch([sandbox("s1", { user_ids: users })])],
    });
    deleteUser.mockImplementation(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return { error: null };
    });

    const result = await cleanupExpiredDemos({ admin, stripe });

    expect(result.usersDeleted).toBe(40);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(10);
  });

  describe("Stripe not configured", () => {
    it("counts the customers as skipped and keeps their sandbox for a later run", async () => {
      const { admin, finishedIds } = setup({ rounds: [TWO_SANDBOXES] });

      const result = await cleanupExpiredDemos({ admin, stripe: null });

      expect(result.ok).toBe(true);
      expect(result.stripeCustomersDeleted).toBe(0);
      expect(result.stripeCustomersSkipped).toBe(2);
      expect(finishedIds()).toEqual([]);
      expect(result.sandboxesPending).toBe(2);
    });

    it("still finishes a sandbox that has no customer", async () => {
      const { admin, finishedIds } = setup({
        rounds: [
          batch([
            sandbox("s1"),
            sandbox("s2", { stripe_customer_ids: ["cus_2"] }),
          ]),
        ],
      });

      await cleanupExpiredDemos({ admin, stripe: null });

      expect(finishedIds()).toEqual(["s1"]);
    });
  });

  describe("failures", () => {
    it("reports a failed database call and stops, without touching users", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, deleteUser, finishedIds } = setup({
        rounds: [{ data: null, error: { message: "boom" } }],
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.ok).toBe(false);
      expect(result.failures.database).toBe("boom");
      expect(deleteUser).not.toHaveBeenCalled();
      expect(finishedIds()).toEqual([]);
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("reports a database call that throws as a failure", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, rpc } = setup();
      rpc.mockRejectedValueOnce(new Error("socket hang up"));

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.ok).toBe(false);
      expect(result.failures.database).toBe("socket hang up");
      consoleError.mockRestore();
    });

    it("reports a malformed database result as a failure", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe } = setup({
        rounds: [{ data: { nope: 1 }, error: null }],
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.ok).toBe(false);
      expect(result.failures.database).toBe("Unexpected cleanup result");
      consoleError.mockRestore();
    });

    it("keeps going after a user deletion fails, and does not finish that sandbox", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, deleteUser, remove, del, finishedIds } = setup({
        rounds: [TWO_SANDBOXES],
        deleteUser: (id) => ({
          error:
            id === "s1-member" ? { message: "auth down", status: 500 } : null,
        }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteUser).toHaveBeenCalledTimes(4);
      expect(remove).toHaveBeenCalled();
      expect(del).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(false);
      expect(result.usersDeleted).toBe(3);
      expect(result.failures.users).toEqual(["s1-member"]);
      expect(finishedIds()).toEqual(["s2"]);
      expect(result.sandboxesFinished).toBe(1);
      expect(result.sandboxesPending).toBe(1);
      expect(consoleError).toHaveBeenCalledWith(
        "cleanup-demo: could not delete user",
        "s1-member",
        "auth down",
      );
      consoleError.mockRestore();
    });

    it("records a user deletion that throws instead of aborting the loop", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, deleteUser, finishedIds } = setup({
        rounds: [TWO_SANDBOXES],
        deleteUser: (id) => {
          if (id === "s1-owner") throw new Error("network reset");
          return { error: null };
        },
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteUser).toHaveBeenCalledTimes(4);
      expect(result.failures.users).toEqual(["s1-owner"]);
      expect(result.usersDeleted).toBe(3);
      expect(finishedIds()).toEqual(["s2"]);
      expect(result.ok).toBe(false);
      consoleError.mockRestore();
    });

    it("counts a user that is already gone (404) as deleted", async () => {
      const { admin, stripe, finishedIds } = setup({
        rounds: [TWO_SANDBOXES],
        deleteUser: () => ({
          error: { message: "User not found", status: 404 },
        }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.usersDeleted).toBe(4);
      expect(result.failures.users).toEqual([]);
      expect(result.ok).toBe(true);
      expect(finishedIds()).toEqual(["s1", "s2"]);
    });

    it("reports a failed storage batch, does not finish the sandboxes in it and still removes the next ones", async () => {
      const consoleError = silenceErrors();
      const paths = Array.from({ length: 150 }, (_, i) => `s1/p/f${i}/x.png`);
      let call = 0;
      const { admin, stripe, remove, finishedIds } = setup({
        rounds: [
          batch([
            sandbox("s1", { storage_paths: paths }),
            sandbox("s2", { storage_paths: ["s2/p/f/x.png"] }),
          ]),
        ],
        remove: () => ({
          error: call++ === 0 ? { message: "storage down" } : null,
        }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(remove).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(false);
      expect(result.failures.storageBatches).toBe(1);
      expect(result.storageObjectsRemoved).toBe(51);
      // s1 has paths in the failed first batch; s2's only path is in the
      // second batch, which worked.
      expect(finishedIds()).toEqual(["s2"]);
      consoleError.mockRestore();
    });

    it("records a storage call that throws", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, finishedIds } = setup({
        rounds: [batch([sandbox("s1")])],
        remove: () => {
          throw new Error("fetch failed");
        },
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.failures.storageBatches).toBe(1);
      expect(finishedIds()).toEqual([]);
      consoleError.mockRestore();
    });

    it("reports a failed Stripe deletion by customer id, keeps going and does not finish that sandbox", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, del, finishedIds } = setup({
        rounds: [TWO_SANDBOXES],
        delCustomer: (id) =>
          id === "cus_1"
            ? Promise.reject(new Error("stripe down"))
            : Promise.resolve({ id, deleted: true }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(del).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(false);
      expect(result.stripeCustomersDeleted).toBe(1);
      expect(result.failures.stripeCustomers).toEqual(["cus_1"]);
      expect(finishedIds()).toEqual(["s2"]);
      consoleError.mockRestore();
    });

    it("records a Stripe client that throws synchronously", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe } = setup({
        rounds: [TWO_SANDBOXES],
        delCustomer: () => {
          throw new Error("bad client");
        },
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.failures.stripeCustomers).toEqual(["cus_1", "cus_2"]);
      consoleError.mockRestore();
    });

    it("counts a Stripe customer that no longer exists as deleted", async () => {
      const missing = Object.assign(new Error("No such customer"), {
        code: "resource_missing",
      });
      const { admin, stripe, finishedIds } = setup({
        rounds: [TWO_SANDBOXES],
        delCustomer: () => Promise.reject(missing),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.stripeCustomersDeleted).toBe(2);
      expect(result.ok).toBe(true);
      expect(finishedIds()).toEqual(["s1", "s2"]);
    });

    it("reports a failed finish call and keeps the sandboxes for the next run", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe } = setup({
        rounds: [TWO_SANDBOXES],
        finish: () => ({ data: null, error: { message: "db down" } }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.ok).toBe(false);
      expect(result.failures.finish).toBe("db down");
      expect(result.sandboxesFinished).toBe(0);
      expect(result.sandboxesPending).toBe(2);
      consoleError.mockRestore();
    });

    it("reports a finish call that throws", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe } = setup({
        rounds: [TWO_SANDBOXES],
        finish: () => Promise.reject(new Error("timeout")),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.failures.finish).toBe("timeout");
      expect(result.ok).toBe(false);
      consoleError.mockRestore();
    });
  });

  describe("stray users", () => {
    it("deletes users the sweep found, without any sandbox to finish", async () => {
      const { admin, stripe, deleteUser, rpc } = setup({
        rounds: [batch([], { orphans: ["ghost-1", "ghost-2"] })],
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteUser.mock.calls.map(([id]) => id).sort()).toEqual([
        "ghost-1",
        "ghost-2",
      ]);
      expect(result.usersDeleted).toBe(2);
      expect(result.ok).toBe(true);
      expect(rpc).not.toHaveBeenCalledWith(
        "finish_demo_sandbox_cleanup",
        expect.anything(),
      );
    });

    it("reports a stray user that cannot be deleted without holding back a sandbox", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, finishedIds } = setup({
        rounds: [batch([sandbox("s1")], { orphans: ["ghost-1"] })],
        deleteUser: (id) => ({
          error: id === "ghost-1" ? { message: "nope", status: 500 } : null,
        }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(result.ok).toBe(false);
      expect(result.failures.users).toEqual(["ghost-1"]);
      expect(finishedIds()).toEqual(["s1"]);
      consoleError.mockRestore();
    });
  });

  describe("rounds", () => {
    const full = (prefix: string) =>
      batch(
        Array.from({ length: 25 }, (_, i) =>
          sandbox(`${prefix}${i}`, {
            user_ids: [`${prefix}${i}-u`],
            storage_paths: [],
          }),
        ),
      );

    it("runs another round while the batch comes back full, and stops at a short one", async () => {
      const { admin, stripe, deleteCalls, finishedIds } = setup({
        rounds: [full("a"), full("b"), batch([sandbox("c0")])],
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteCalls()).toHaveLength(3);
      expect(result.rounds).toBe(3);
      expect(result.sandboxesFinished).toBe(51);
      expect(finishedIds()).toHaveLength(51);
      expect(result.ok).toBe(true);
    });

    it("does not start another round after one had a failure", async () => {
      const consoleError = silenceErrors();
      const { admin, stripe, deleteCalls } = setup({
        rounds: [full("a"), full("b")],
        deleteUser: (id) => ({
          error: id === "a0-u" ? { message: "auth down", status: 500 } : null,
        }),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteCalls()).toHaveLength(1);
      expect(result.rounds).toBe(1);
      expect(result.ok).toBe(false);
      consoleError.mockRestore();
    });

    it("stops after a fixed number of rounds so a run stays short", async () => {
      const { admin, stripe, deleteCalls } = setup({
        rounds: Array.from({ length: 30 }, (_, i) => full(`r${i}-`)),
      });

      const result = await cleanupExpiredDemos({ admin, stripe });

      expect(deleteCalls()).toHaveLength(12);
      expect(result.rounds).toBe(12);
    });
  });

  it("retries on the next run what failed on this one", async () => {
    const consoleError = silenceErrors();
    // A tiny stand-in for the database: a sandbox stays until finished.
    const pending = new Map<string, SandboxPart>([
      ["s1", sandbox("s1", { stripe_customer_ids: ["cus_1"] })],
      ["s2", sandbox("s2")],
    ]);
    let failUser = true;
    const deleted = new Set<string>();
    const { admin, stripe, rpc, deleteUser } = setup();
    rpc.mockImplementation((...call: Parameters<CleanupAdminClient["rpc"]>) => {
      if (call[0] === "finish_demo_sandbox_cleanup") {
        for (const id of call[1].p_ids) pending.delete(id);
        return Promise.resolve({ data: call[1].p_ids.length, error: null });
      }
      return Promise.resolve(batch([...pending.values()]));
    });
    deleteUser.mockImplementation((id: string) => {
      if (id === "s1-member" && failUser) {
        return Promise.resolve({
          error: { message: "auth down", status: 500 },
        });
      }
      deleted.add(id);
      return Promise.resolve({ error: null });
    });

    const first = await cleanupExpiredDemos({ admin, stripe });

    expect(first.ok).toBe(false);
    expect(first.failures.users).toEqual(["s1-member"]);
    expect([...pending.keys()]).toEqual(["s1"]);

    failUser = false;
    const second = await cleanupExpiredDemos({ admin, stripe });

    expect(second.ok).toBe(true);
    expect(second.sandboxesFinished).toBe(1);
    expect(pending.size).toBe(0);
    expect(deleted.has("s1-member")).toBe(true);
    consoleError.mockRestore();
  });
});
