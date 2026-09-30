import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";
const NOW = new Date("2026-03-15T12:00:00.000Z");

const { getCurrentWorkspaceMock, createClientMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));

import WorkspaceDashboardPage from "./page";

type Role = "owner" | "member" | "client";
type Result = {
  data?: unknown[] | null;
  count?: number | null;
  error?: Error | null;
};
type Call = { method: string; args: unknown[] };

function workspace(role: Role = "owner") {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: WORKSPACE_SLUG,
    role,
    clientId: role === "client" ? "c1" : null,
    userId: "00000001-0000-4000-8000-000000000001",
    userEmail: "owner@clientdesk.test",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Log = { started: string[]; calls: Record<string, Call[]> };

/** A chainable, lazy query like the Supabase builder: it only counts as
 * started once something awaits it, which is when a real request is sent.
 * The key is picked from the calls made, so the two head-count reads on
 * `projects` (all, and `status = active`) stay apart. */
function fakeQuery(
  rowsKey: string,
  headKey: string | null,
  resolve: (key: string) => Promise<Result>,
  log: Log,
) {
  let key = rowsKey;
  const calls: Call[] = [];
  const query: Record<string, unknown> = {
    then: (
      onFulfilled: (value: Result) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => {
      log.started.push(key);
      log.calls[key] = calls;
      return resolve(key).then(onFulfilled, onRejected);
    },
  };
  for (const method of ["select", "eq", "gte", "order", "limit"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "select" && headKey && (args[1] as HeadOptions)?.head) {
        key = headKey;
      }
      if (method === "eq" && args[0] === "status" && args[1] === "active") {
        key = "projectsActive";
      }
      return query;
    };
  }
  return query;
}

type HeadOptions = { head?: boolean } | undefined;

const EMPTY: Record<string, Result> = {
  projectsTotal: { count: 0 },
  projectsActive: { count: 0 },
  projects: { data: [] },
  clientsCount: { count: 0 },
  weekCount: { count: 0 },
  updates: { data: [] },
  comments: { data: [] },
  files: { data: [] },
  members: { data: [] },
};

function stubSupabase(results: Record<string, Promise<Result> | Result> = {}) {
  const log: Log = { started: [], calls: {} };
  const resolve = (key: string): Promise<Result> =>
    Promise.resolve(results[key] ?? EMPTY[key]);
  const table = (rowsKey: string, headKey: string | null) => ({
    select: (...args: unknown[]) =>
      (
        fakeQuery(rowsKey, headKey, resolve, log) as {
          select: (...a: unknown[]) => unknown;
        }
      ).select(...args),
  });

  createClientMock.mockResolvedValue({
    from: (name: string) => {
      switch (name) {
        case "projects":
          return table("projects", "projectsTotal");
        case "clients":
          return table("clientsCount", "clientsCount");
        case "project_updates":
          return table("updates", "weekCount");
        case "update_comments":
          return table("comments", null);
        case "project_files":
          return table("files", null);
        case "workspace_members":
          return table("members", null);
        default:
          throw new Error(`from() was not stubbed for table "${name}"`);
      }
    },
  });
  return log;
}

async function render() {
  const element = await WorkspaceDashboardPage({
    params: Promise.resolve({ slug: WORKSPACE_SLUG }),
  });
  return renderToStaticMarkup(createElement("div", null, element));
}

function text(html: string) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

const project = (
  id: string,
  name: string,
  status: "active" | "on_hold" | "done",
  clientName: string | null,
  createdAt: string,
) => ({
  id,
  name,
  status,
  created_at: createdAt,
  clients: clientName ? { name: clientName } : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WorkspaceDashboardPage", () => {
  it("starts every read together instead of one after the other", async () => {
    const gates = {
      projectsTotal: deferred<Result>(),
      projectsActive: deferred<Result>(),
      projects: deferred<Result>(),
      clientsCount: deferred<Result>(),
      weekCount: deferred<Result>(),
      updates: deferred<Result>(),
      comments: deferred<Result>(),
      files: deferred<Result>(),
      members: deferred<Result>(),
    };
    const log = stubSupabase(
      Object.fromEntries(
        Object.entries(gates).map(([key, gate]) => [key, gate.promise]),
      ),
    );

    const pagePromise = WorkspaceDashboardPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
    });

    // No read has resolved yet, so a page that awaited them one by one
    // would never get past the first. Promise.all issues all nine.
    await vi.waitFor(() =>
      expect([...log.started].sort()).toEqual(Object.keys(gates).sort()),
    );

    for (const [key, gate] of Object.entries(gates)) {
      gate.resolve(EMPTY[key] ?? {});
    }
    expect(await pagePromise).toBeTruthy();
  });

  it("scopes every read to the workspace", async () => {
    const log = stubSupabase();
    await render();

    for (const key of Object.keys(EMPTY)) {
      expect(log.calls[key], key).toContainEqual({
        method: "eq",
        args: ["workspace_id", WORKSPACE_ID],
      });
    }
  });

  it("counts projects with head-only reads and lists only the five newest", async () => {
    const log = stubSupabase();
    await render();

    const head = { count: "exact", head: true };
    expect(log.calls.projectsTotal).toContainEqual({
      method: "select",
      args: ["id", head],
    });
    expect(log.calls.projectsActive).toContainEqual({
      method: "select",
      args: ["id", head],
    });
    expect(log.calls.projectsActive).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
    expect(log.calls.projects).toContainEqual({
      method: "select",
      args: ["id, name, status, created_at, clients(name)"],
    });
    expect(log.calls.projects).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(log.calls.projects).toContainEqual({ method: "limit", args: [5] });
  });

  it("reads the feed newest first with a stable tie-break, embedding the project name", async () => {
    const log = stubSupabase();
    await render();

    for (const key of ["updates", "comments", "files"]) {
      const calls = log.calls[key] ?? [];
      const select = calls.find((call) => call.method === "select");
      expect(String(select?.args[0]), key).toContain("projects(name)");
      expect(
        calls.filter((call) => call.method === "order"),
        key,
      ).toEqual([
        { method: "order", args: ["created_at", { ascending: false }] },
        { method: "order", args: ["id"] },
      ]);
      expect(calls, key).toContainEqual({ method: "limit", args: [8] });
    }
  });

  it("counts updates from the last 7 days", async () => {
    const log = stubSupabase();
    await render();

    expect(log.calls.weekCount).toContainEqual({
      method: "gte",
      args: ["created_at", "2026-03-08T12:00:00.000Z"],
    });
  });

  it.each([
    "projectsTotal",
    "projectsActive",
    "projects",
    "clientsCount",
    "weekCount",
    "updates",
    "comments",
    "files",
    "members",
  ])(
    "throws when the %s read fails instead of rendering an empty dashboard",
    async (key) => {
      const failure = new Error(`${key} failed`);
      stubSupabase({ [key]: { error: failure } });

      await expect(render()).rejects.toBe(failure);
    },
  );

  it("does not run, or fail on, the clients count for a client user", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    const log = stubSupabase({ clientsCount: { error: new Error("nope") } });
    const html = await render();

    expect(log.started).not.toContain("clientsCount");
    expect(text(html)).not.toContain("Clients");
    expect(text(html)).toContain("Active projects");
    expect(text(html)).toContain("Updates this week");
  });

  it("shows the Clients metric with its count to staff", async () => {
    stubSupabase({ clientsCount: { count: 3 } });
    const html = await render();

    expect(text(html)).toMatch(/Active projects.*Clients 3.*Updates this week/);
  });

  it("shortens the long metric labels on phones inside one text node, so the full label stays in the accessible name", async () => {
    stubSupabase({ clientsCount: { count: 3 } });
    const html = await render();

    expect(html).toMatch(
      /Active<span[^>]*\bmax-sm:sr-only\b[^>]*> projects<\/span>/,
    );
    expect(html).toMatch(
      /Updates<span[^>]*\bmax-sm:sr-only\b[^>]*> this week<\/span>/,
    );
    // No duplicated, aria-hidden short copy next to a full one.
    expect(html).not.toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>Active<\/span>/,
    );
    expect(html).not.toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>Updates<\/span>/,
    );
    // "Clients" is already one short word.
    expect(html).not.toMatch(/sr-only[^>]*>[^<]*Clients/);
  });

  it("shows active projects as N of M and the weekly update count", async () => {
    stubSupabase({
      projectsTotal: { count: 3 },
      projectsActive: { count: 1 },
      projects: {
        data: [
          project("p1", "One", "active", "Acme", "2026-03-03T00:00:00Z"),
          project("p2", "Two", "on_hold", "Acme", "2026-03-02T00:00:00Z"),
          project("p3", "Three", "done", null, "2026-03-01T00:00:00Z"),
        ],
      },
      weekCount: { count: 4 },
    });
    const html = await render();

    expect(text(html)).toMatch(/Active projects 1 of 3/);
    expect(text(html)).toMatch(/Updates this week 4/);
  });

  it("counts more projects than it lists", async () => {
    stubSupabase({
      projectsTotal: { count: 1500 },
      projectsActive: { count: 1200 },
      projects: {
        data: [project("p1", "One", "active", "Acme", "2026-03-03T00:00:00Z")],
      },
    });
    const html = await render();

    expect(text(html)).toMatch(/Active projects 1200 of 1500/);
  });

  it("omits the total when there are no projects", async () => {
    stubSupabase();
    const html = await render();

    expect(text(html)).toMatch(/Active projects 0(?! of)/);
    expect(text(html)).not.toContain("0 of 0");
  });

  it("shows every metric to staff and all but Clients to a client user", async () => {
    stubSupabase();
    const staffHtml = await render();

    for (const label of ["Active projects", "Clients", "Updates this week"]) {
      expect(text(staffHtml)).toContain(label);
    }

    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    stubSupabase();
    const clientHtml = await render();

    expect(text(clientHtml)).toContain("Active projects");
    expect(text(clientHtml)).toContain("Updates this week");
    expect(text(clientHtml)).not.toContain("Clients");
  });

  it("puts each empty state inside its own section", async () => {
    stubSupabase();
    const html = await render();
    const sections = html.match(/<section[^>]*>[^]*?<\/section>/g) ?? [];

    expect(sections).toHaveLength(2);
    expect(text(sections[0] ?? "")).toContain("Start your first project");
    expect(text(sections[1] ?? "")).toContain("No activity yet");
  });

  it("titles the h1 Overview and leaves the workspace name to the shell", async () => {
    stubSupabase();
    const html = await render();

    expect(html).toMatch(/<h1[^>]*>Overview<\/h1>/);
    expect(html).not.toContain("Acme Agency");
  });

  it("lists the projects it is given with client, status and a link", async () => {
    stubSupabase({
      projectsTotal: { count: 7 },
      projectsActive: { count: 7 },
      projects: {
        data: Array.from({ length: 5 }, (_, index) =>
          project(
            `p${index}`,
            `Project ${index}`,
            "active",
            `Client ${index}`,
            `2026-03-0${7 - index}T00:00:00Z`,
          ),
        ),
      },
    });
    const html = await render();

    expect(html).toContain(`href="/w/${WORKSPACE_SLUG}/projects/p0"`);
    expect(html).toContain(`href="/w/${WORKSPACE_SLUG}/projects/p4"`);
    expect(text(html)).toContain("Project 0 Client 0 Active");
    expect(html).toContain(`href="/w/${WORKSPACE_SLUG}/projects"`);
  });

  it("shows the empty states, with a next action only for staff", async () => {
    stubSupabase();
    const staffHtml = await render();

    expect(text(staffHtml)).toContain("Start your first project");
    expect(text(staffHtml)).toContain("No activity yet");
    expect(staffHtml).toMatch(
      new RegExp(
        `<a(?![^>]*role=)[^>]*href="/w/${WORKSPACE_SLUG}/projects"[^>]*>Go to project list`,
      ),
    );

    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    stubSupabase();
    const clientHtml = await render();

    expect(text(clientHtml)).toContain("Start your first project");
    expect(clientHtml).not.toContain("Go to project list");
  });

  describe("feed", () => {
    const feedRow = (
      id: string,
      authorId: string | null,
      createdAt: string,
      projectName: string | null = "Website",
    ) => ({
      id,
      project_id: "p1",
      author_id: authorId,
      created_at: createdAt,
      projects: projectName ? { name: projectName } : null,
    });

    it("renders items with author, verb, project link and relative time", async () => {
      stubSupabase({
        members: {
          data: [
            { user_id: "u1", profiles: { full_name: "Olivia Owner" } },
            { user_id: "u2", profiles: { full_name: "Carla Client" } },
          ],
        },
        updates: { data: [feedRow("a", "u1", "2026-03-15T11:00:00Z")] },
        comments: { data: [feedRow("b", "u2", "2026-03-15T10:00:00Z")] },
        files: {
          data: [
            {
              ...feedRow("c", null, "2026-03-14T12:00:00Z"),
              uploaded_by: null,
              name: "brief.pdf",
            },
          ],
        },
      });
      const html = await render();
      const feed = html.slice(html.indexOf("<ol"));

      expect(text(feed)).toContain("Olivia Owner posted an update on Website");
      expect(text(feed)).toContain("Carla Client commented on Website");
      expect(text(feed)).toContain(
        "Former member uploaded brief.pdf to Website",
      );
      expect(feed).toContain(`href="/w/${WORKSPACE_SLUG}/projects/p1"`);
      expect(feed).toContain('dateTime="2026-03-15T11:00:00Z"');
      expect(feed).toContain("1 hour ago");
      expect(feed.indexOf("posted an update")).toBeLessThan(
        feed.indexOf("commented"),
      );
      expect(text(html)).not.toContain("No activity yet");
    });

    it("names an author who is not in the member map 'Former member', never 'Unknown'", async () => {
      stubSupabase({
        members: { data: [] },
        updates: {
          data: [feedRow("a", "removed-user", "2026-03-15T11:00:00Z")],
        },
      });
      const html = await render();

      expect(text(html)).toContain("Former member posted an update on Website");
      expect(text(html)).not.toMatch(/unknown/i);
    });

    it("keeps a member's own name when their profile has no full name", async () => {
      stubSupabase({
        members: { data: [{ user_id: "u1", profiles: { full_name: null } }] },
        updates: { data: [feedRow("a", "u1", "2026-03-15T11:00:00Z")] },
      });
      const html = await render();

      expect(text(html)).not.toContain("Former member");
    });

    it("falls back to 'Unknown project' when the embedded project is missing", async () => {
      stubSupabase({
        updates: {
          data: [feedRow("a", null, "2026-03-15T11:00:00Z", null)],
        },
      });
      const html = await render();

      expect(text(html)).toContain("posted an update on Unknown project");
    });

    it("renders an item with an invalid timestamp without throwing", async () => {
      stubSupabase({
        updates: { data: [feedRow("a", null, "not a date")] },
      });
      const html = await render();

      expect(text(html)).toContain("Former member posted an update on Website");
    });
  });

  it("gives the Recent activity section an accessible name", async () => {
    stubSupabase();
    const html = await render();

    expect(html).toMatch(
      /<section[^>]*aria-labelledby="recent-activity-heading"/,
    );
    expect(html).toMatch(
      /<h2[^>]*id="recent-activity-heading"[^>]*>Recent activity<\/h2>/,
    );
  });

  it("hides the activity avatar from assistive technology through the component", async () => {
    stubSupabase({
      updates: {
        data: [
          {
            id: "a",
            project_id: "p1",
            author_id: null,
            created_at: "2026-03-15T11:00:00Z",
            projects: { name: "Website" },
          },
        ],
      },
    });
    const html = await render();
    const avatar = html.match(/<span[^>]*data-slot="avatar"[^>]*>/)?.[0];

    expect(avatar).toContain('aria-hidden="true"');
  });
});
