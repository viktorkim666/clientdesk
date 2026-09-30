import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

const {
  getCurrentWorkspaceMock,
  createClientMock,
  createAdminClientMock,
  canSwitchMock,
} = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  canSwitchMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/demo/admin", () => ({
  toDemoAdminClient: (client: unknown) => client,
}));
vi.mock("@/lib/demo/switch", () => ({ canSwitchSandboxRole: canSwitchMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));

import { DemoBanner } from "@/components/demo-banner";
import { AppSidebar } from "./app-sidebar";
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
type Table = "workspace_members" | "profiles" | "demo_sandboxes" | "clients";

function stubSupabase(given: Partial<Record<Table, Promise<Result> | Result>>) {
  // Outside a sandbox the two extra tables answer with no row.
  const results: Record<Table, Promise<Result> | Result> = {
    demo_sandboxes: { data: null, error: null },
    clients: { data: null, error: null },
    ...given,
  } as Record<Table, Promise<Result> | Result>;
  const started: string[] = [];
  createClientMock.mockResolvedValue({
    from: (table: Table) => {
      const query: Record<string, unknown> = {
        then: (
          onFulfilled: (value: Result) => unknown,
          onRejected: (reason: unknown) => unknown,
        ) => {
          started.push(table);
          return Promise.resolve(results[table]).then(onFulfilled, onRejected);
        },
      };
      for (const method of ["select", "eq", "or", "limit", "maybeSingle"]) {
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
  createAdminClientMock.mockReturnValue({ marker: "admin" });
  canSwitchMock.mockResolvedValue(true);
  getCurrentWorkspaceMock.mockResolvedValue({
    id: WORKSPACE_ID,
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
      expect([...started].sort()).toEqual([
        "demo_sandboxes",
        "profiles",
        "workspace_members",
      ]),
    );

    memberships.resolve(OK_MEMBERSHIPS);
    profile.resolve(OK_PROFILE);
    expect(await pending).toBeTruthy();
  });

  it("reads the client name in the same round as the other reads", async () => {
    getCurrentWorkspaceMock.mockResolvedValue({
      id: WORKSPACE_ID,
      name: "Acme",
      slug: "acme",
      role: "client",
      clientId: "c1",
      userId: "u2",
      userEmail: "priya@demo.clientdesk.invalid",
    });
    const memberships = deferred<Result>();
    const started = stubSupabase({
      workspace_members: memberships.promise,
      profiles: OK_PROFILE,
      demo_sandboxes: { data: { id: "s1" }, error: null },
      clients: { data: { name: "Acme Bakery" }, error: null },
    });

    const pending = renderLayout();

    // The memberships read is still open, so a client lookup that waited for
    // the sandbox answer would not have started yet.
    await vi.waitFor(() => expect(started).toContain("clients"));
    expect(started).toContain("demo_sandboxes");

    memberships.resolve(OK_MEMBERSHIPS);
    expect(await pending).toBeTruthy();
  });

  it("does not look up the client outside a client membership", async () => {
    const started = stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: OK_PROFILE,
    });

    await renderLayout();

    expect(started).not.toContain("clients");
  });

  it("goes through the UUID guard, so a malformed workspace id never reaches the sandbox query", async () => {
    getCurrentWorkspaceMock.mockResolvedValue({
      id: "not-a-uuid",
      name: "Acme",
      slug: "acme",
      role: "owner",
      clientId: null,
      userId: "u1",
      userEmail: "ada@example.test",
    });
    const started = stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: OK_PROFILE,
    });

    expect(findBanner(await renderLayout())).toBeNull();
    expect(started).not.toContain("demo_sandboxes");
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

  it("throws a failed sandbox read instead of hiding the banner", async () => {
    const failure = new Error("sandbox failed");
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: OK_PROFILE,
      demo_sandboxes: { data: null, error: failure },
    });

    await expect(renderLayout()).rejects.toBe(failure);
  });
});

// The layout returns an element tree; walk it for an element of one type.
function findProps<P>(node: unknown, type: unknown): P | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps<P>(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) return element.props as P;
  return findProps<P>(element.props?.children, type);
}

type BannerProps = {
  label: string;
  shortLabel: string;
  switchLabel: string | null;
  switchShortLabel: string | null;
};

const findBanner = (node: unknown) => findProps<BannerProps>(node, DemoBanner);
const findSidebar = (node: unknown) =>
  findProps<{ demoDetail: string | null }>(node, AppSidebar);

describe("WorkspaceLayout demo banner", () => {
  it("shows no banner outside a sandbox", async () => {
    stubSupabase({ workspace_members: OK_MEMBERSHIPS, profiles: OK_PROFILE });

    expect(findBanner(await renderLayout())).toBeNull();
  });

  it("names the owner and offers the client view inside a sandbox", async () => {
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: { full_name: "Maya Chen" }, error: null },
      demo_sandboxes: { data: { id: "s1" }, error: null },
    });

    expect(findBanner(await renderLayout())).toEqual({
      label: "Viewing as Maya Chen (agency owner)",
      shortLabel: "Maya Chen, agency",
      switchLabel: "Switch to client view",
      switchShortLabel: "Client view",
    });
  });

  it("names the client's company for a client inside a sandbox", async () => {
    getCurrentWorkspaceMock.mockResolvedValue({
      id: WORKSPACE_ID,
      name: "Acme",
      slug: "acme",
      role: "client",
      clientId: "c1",
      userId: "u2",
      userEmail: "priya@demo.clientdesk.invalid",
    });
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: { full_name: "Priya Nair" }, error: null },
      demo_sandboxes: { data: { id: "s1" }, error: null },
      clients: { data: { name: "Acme Bakery" }, error: null },
    });

    expect(findBanner(await renderLayout())).toEqual({
      label: "Viewing as Priya Nair (client, Acme Bakery)",
      shortLabel: "Priya Nair, client",
      switchLabel: "Switch to agency view",
      switchShortLabel: "Agency view",
    });
  });

  it("drops the switch when the other role was removed from the workspace", async () => {
    canSwitchMock.mockResolvedValue(false);
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: { full_name: "Maya Chen" }, error: null },
      demo_sandboxes: { data: { id: "s1" }, error: null },
    });

    const banner = findBanner(await renderLayout());

    expect(banner).toMatchObject({
      label: "Viewing as Maya Chen (agency owner)",
      switchLabel: null,
      switchShortLabel: null,
    });
    expect(canSwitchMock).toHaveBeenCalledWith(
      { marker: "admin" },
      "u1",
      expect.any(Date),
    );
  });

  it("offers no switch when the admin client is not configured", async () => {
    createAdminClientMock.mockReturnValue(null);
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: { full_name: "Maya Chen" }, error: null },
      demo_sandboxes: { data: { id: "s1" }, error: null },
    });

    expect(findBanner(await renderLayout())).toMatchObject({
      switchLabel: null,
    });
    expect(canSwitchMock).not.toHaveBeenCalled();
  });

  it("gives the account menu the role line inside a sandbox, and nothing outside", async () => {
    stubSupabase({
      workspace_members: OK_MEMBERSHIPS,
      profiles: { data: { full_name: "Maya Chen" }, error: null },
      demo_sandboxes: { data: { id: "s1" }, error: null },
    });
    expect(findSidebar(await renderLayout())?.demoDetail).toBe("Owner");

    stubSupabase({ workspace_members: OK_MEMBERSHIPS, profiles: OK_PROFILE });
    expect(findSidebar(await renderLayout())?.demoDetail).toBeNull();
    expect(canSwitchMock).toHaveBeenCalledTimes(1);
  });
});
