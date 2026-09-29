import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";

const { getCurrentWorkspaceMock, createClientMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));

import ProjectsPage from "./page";

type Role = "owner" | "member" | "client";
type Row = Record<string, unknown>;

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

function stubSupabase({
  projects = [],
  clients = [],
}: { projects?: Row[]; clients?: Row[] } = {}) {
  const selects: string[] = [];
  createClientMock.mockResolvedValue({
    from: (table: string) => {
      const rows = table === "projects" ? projects : clients;
      return {
        select: (columns: string) => {
          if (table === "projects") selects.push(columns);
          return {
            eq: () => ({ order: () => Promise.resolve({ data: rows }) }),
          };
        },
      };
    },
  });
  return selects;
}

async function render() {
  const element = await ProjectsPage({
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

function newProjectButtons(html: string) {
  return html.match(/<button[^>]*>New project<\/button>/g) ?? [];
}

const project = (
  id: string,
  name: string,
  status: "active" | "on_hold" | "done",
  clientName: string | null,
) => ({
  id,
  name,
  status,
  created_at: "2026-03-03T10:00:00Z",
  clients: clientName ? { name: clientName } : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
});

describe("ProjectsPage", () => {
  it("renders the header with a description and the created date in the existing select", async () => {
    const selects = stubSupabase({
      projects: [project("p1", "Website", "active", "Acme")],
      clients: [{ id: "c1", name: "Acme" }],
    });
    const html = await render();

    expect(html).toMatch(/<h1[^>]*>Projects<\/h1>/);
    expect(html).toMatch(/<h1[^>]*>Projects<\/h1>\s*<p[^>]*>[^<]+<\/p>/);
    expect(selects).toEqual(["id, name, status, created_at, clients(name)"]);
    expect(text(html)).toContain("Created");
    expect(text(html)).toContain("Mar 3, 2026");
  });

  it("lists each project with its link, client and a sentence-case status badge", async () => {
    stubSupabase({
      projects: [
        project("p1", "Website", "on_hold", "Acme"),
        project("p2", "Logo", "done", null),
      ],
      clients: [{ id: "c1", name: "Acme" }],
    });
    const html = await render();

    expect(html).toMatch(
      new RegExp(
        `<a[^>]*href="/w/${WORKSPACE_SLUG}/projects/p1"[^>]*>Website</a>`,
      ),
    );
    expect(text(html)).toContain("Acme");
    expect(text(html)).toContain("On hold");
    expect(text(html)).toContain("Done");
    expect(text(html)).toContain("—");
    expect(html).not.toContain("on_hold");
  });

  it("hides the Client column below sm and repeats the client under the name", async () => {
    stubSupabase({
      projects: [project("p1", "Website", "active", "Acme")],
      clients: [{ id: "c1", name: "Acme" }],
    });
    const html = await render();

    expect(html).toMatch(/<th[^>]*hidden sm:table-cell[^>]*>Client<\/th>/);
    expect(html).toMatch(
      /<\/a><span[^>]*\bsm:hidden\b[^>]*>Acme<\/span><\/td>/,
    );
  });

  it("keeps the New project trigger in the header when projects exist", async () => {
    stubSupabase({
      projects: [project("p1", "Website", "active", "Acme")],
      clients: [{ id: "c1", name: "Acme" }],
    });
    const html = await render();

    expect(newProjectButtons(html)).toHaveLength(1);
    expect(html.indexOf("New project")).toBeLessThan(html.indexOf("<table"));
  });

  it("moves the trigger into the empty state for staff with clients", async () => {
    stubSupabase({ clients: [{ id: "c1", name: "Acme" }] });
    const html = await render();

    expect(text(html)).toContain("Start your first project");
    expect(newProjectButtons(html)).toHaveLength(1);
    expect(html.indexOf("New project")).toBeGreaterThan(
      html.indexOf("Start your first project"),
    );
    expect(html).not.toContain("<table");
  });

  it("asks staff without clients to add one first, with one disabled New project button", async () => {
    stubSupabase();
    const html = await render();

    expect(text(html)).toContain("Add a client before creating a project");
    expect(html).toMatch(
      new RegExp(
        `<a(?![^>]*role=)[^>]*href="/w/${WORKSPACE_SLUG}/clients"[^>]*>Add a client first</a>`,
      ),
    );
    const buttons = newProjectButtons(html);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain("disabled");
  });

  it("explains an empty list to a client without any action", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    stubSupabase();
    const html = await render();

    expect(text(html)).toContain("No projects yet");
    expect(newProjectButtons(html)).toHaveLength(0);
    expect(html).not.toContain("Add a client first");
  });

  it("does not read clients for a client user", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    stubSupabase({ projects: [project("p1", "Website", "active", "Acme")] });
    const html = await render();

    expect(newProjectButtons(html)).toHaveLength(0);
  });
});
