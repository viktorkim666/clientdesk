import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentWorkspaceMock, createClientMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));

import WorkspaceLayout from "./layout";

type Result = { data: unknown; error: Error | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// A lazy, chainable query like the Supabase builder: it only counts as
// started once something awaits it.
function stubSupabase(
  results: Record<"workspace_members" | "profiles", Promise<Result> | Result>,
) {
  const started: string[] = [];
  createClientMock.mockResolvedValue({
    from: (table: "workspace_members" | "profiles") => {
      const query: Record<string, unknown> = {
        then: (
          onFulfilled: (value: Result) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) => {
          started.push(table);
          return Promise.resolve(results[table]).then(onFulfilled, onRejected);
        },
      };
      for (const method of ["select", "eq", "maybeSingle"]) {
        query[method] = () => query;
      }
      return query;
    },
  });
  return started;
}

const OK_MEMBERSHIPS: Result = {
  data: [{ workspaces: { name: "Acme", slug: "acme" } }],
  error: null,
};
const OK_PROFILE: Result = { data: { full_name: "Ada" }, error: null };

function renderLayout() {
  return WorkspaceLayout({
    children: null,
    params: Promise.resolve({ slug: "acme" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentWorkspaceMock.mockResolvedValue({
    id: "w1",
    name: "Acme",
    slug: "acme",
    role: "owner",
    clientId: null,
    userId: "u1",
    userEmail: "ada@example.test",
  });
});

describe("WorkspaceLayout", () => {
  it("starts the memberships and profile reads together", async () => {
    const memberships = deferred<Result>();
    const profile = deferred<Result>();
    const started = stubSupabase({
      workspace_members: memberships.promise,
      profiles: profile.promise,
    });

    const pending = renderLayout();

    // Neither read has resolved, so a layout that awaited them one by one
    // would never start the second.
    await vi.waitFor(() =>
      expect([...started].sort()).toEqual(["profiles", "workspace_members"]),
    );

    memberships.resolve(OK_MEMBERSHIPS);
    profile.resolve(OK_PROFILE);
    expect(await pending).toBeTruthy();
  });

  it("throws a failed profile read instead of silently dropping it", async () => {
    const failure = new Error("profiles failed");
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: null, error: failure },
    });

    await expect(renderLayout()).rejects.toBe(failure);
  });

  it("throws a failed memberships read instead of rendering no workspaces", async () => {
    const failure = new Error("memberships failed");
    stubSupabase({
      workspace_members: { data: null, error: failure },
      profiles: OK_PROFILE,
    });

    await expect(renderLayout()).rejects.toBe(failure);
  });
});
