import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "b0000000-0000-4000-8000-000000000001";
const STAFF_ID = "00000001-0000-4000-8000-000000000001";

const { getCurrentWorkspaceMock, createClientMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));
vi.mock("@/lib/ai", () => ({ getDraftGenerator: () => null }));
vi.mock("./actions", () => ({
  changeStatus: vi.fn(),
  postUpdate: vi.fn(),
  postComment: vi.fn(),
  deleteComment: vi.fn(),
  registerFile: vi.fn(),
  deleteFile: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

import ProjectPage from "./page";

type Row = Record<string, unknown>;

function workspace(role: "owner" | "member" | "client" = "owner") {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: "acme-agency",
    role,
    clientId: null,
    userId: STAFF_ID,
  };
}

function stub({
  updates = [],
  comments = [],
  files = [],
}: { updates?: Row[]; comments?: Row[]; files?: Row[] } = {}) {
  const selects: Record<string, string> = {};
  const chain = (table: string, columns: string, result: unknown) => {
    selects[table] = columns;
    const node: Record<string, unknown> = {
      eq: () => node,
      in: () => node,
      order: () => node,
      limit: () => node,
      maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown) => resolve(result),
    };
    return node;
  };
  createClientMock.mockResolvedValue({
    from: (table: string) => ({
      select: (columns: string) => {
        switch (table) {
          case "projects":
            return chain(table, columns, {
              data: {
                id: PROJECT_ID,
                name: "Website Redesign",
                status: "on_hold",
                created_at: "2026-02-10T09:00:00Z",
                clients: { name: "Globex Corp" },
              },
              error: null,
            });
          case "workspace_billing":
            return chain(table, columns, { data: null });
          case "workspace_members":
            return chain(table, columns, {
              data: [
                { user_id: STAFF_ID, profiles: { full_name: "Ada Lovelace" } },
              ],
            });
          case "project_updates":
            return chain(table, columns, { data: updates });
          case "update_comments":
            return chain(table, columns, { data: comments });
          case "project_files":
            return chain(table, columns, { data: files });
          default:
            throw new Error(`from() was not stubbed for table "${table}"`);
        }
      },
    }),
  });
  return selects;
}

async function render() {
  const element = await ProjectPage({
    params: Promise.resolve({ slug: "acme-agency", projectId: PROJECT_ID }),
  });
  return renderToStaticMarkup(createElement("div", null, element));
}

function text(html: string) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-03T12:00:00Z"));
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectPage", () => {
  it("shows the project name, the client and the created date in the header", async () => {
    const selects = stub();
    const html = await render();

    expect(html).toMatch(/<h1[^>]*>Website Redesign<\/h1>/);
    expect(text(html)).toContain("Globex Corp");
    expect(text(html)).toContain("Created Feb 10, 2026");
    expect(selects.projects).toContain("created_at");
    expect(html).toMatch(/<a[^>]*href="\/w\/acme-agency\/projects"/);
  });

  it("makes the Updates and Files card titles real h2 headings", async () => {
    stub();
    const html = await render();

    expect(html).toMatch(/<h2[^>]*>Updates<\/h2>/);
    expect(html).toMatch(
      /<h2[^>]*id="files-heading"[^>]*tabindex="-1"[^>]*>Files<\/h2>/,
    );
  });

  it("hides the back arrow from assistive technology so the link reads Projects", async () => {
    stub();
    const html = await render();

    expect(html).toMatch(
      /<a[^>]*href="\/w\/acme-agency\/projects"[^>]*><span aria-hidden="true">←<\/span> Projects<\/a>/,
    );
  });

  it("hides the client avatar through the component, without a wrapper", async () => {
    stub();
    const html = await render();

    expect(html).not.toContain('class="contents"');
    expect(html).toMatch(/<span[^>]*data-slot="avatar"[^>]*aria-hidden="true"/);
  });

  it("names an unmapped or null author 'Former member', never 'Unknown'", async () => {
    stub({
      updates: [
        {
          id: "u1",
          body: "By a removed member",
          created_at: "2026-03-03T10:00:00Z",
          author_id: "ghost",
        },
      ],
      comments: [
        {
          id: "c1",
          update_id: "u1",
          body: "By nobody",
          created_at: "2026-03-03T11:00:00Z",
          author_id: null,
        },
      ],
      files: [
        {
          id: "f1",
          name: "a.pdf",
          size_bytes: 1,
          storage_path: "w/p/f1/a.pdf",
          uploaded_by: "ghost",
          mime_type: "application/pdf",
          created_at: "2026-03-03T10:00:00Z",
        },
      ],
    });
    const html = await render();

    expect(text(html)).not.toMatch(/unknown/i);
    expect(text(html)).toContain("Former member");
  });

  it("describes the updates card in user-facing words", async () => {
    stub();
    const html = await render();

    expect(text(html)).toContain(
      "What the team shared with the client, newest first.",
    );
    expect(text(html)).not.toContain("latest 50");
  });

  it("gives staff the status combobox", async () => {
    stub();
    const html = await render();

    expect(html).toContain('aria-label="Project status"');
    expect(html).toContain('role="combobox"');
  });

  it("gives a client a status badge instead of the combobox", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("client"));
    stub();
    const html = await render();

    expect(html).not.toContain('role="combobox"');
    expect(html).toMatch(/data-slot="badge"[^>]*>[^]*On hold/);
  });

  it("shows empty states for updates and files", async () => {
    stub();
    const html = await render();

    expect(text(html)).toContain("No updates yet");
    expect(text(html)).toContain("No files yet");
    expect(html).not.toContain("<table");
  });

  it("renders relative time with the absolute date in the title", async () => {
    stub({
      updates: [
        {
          id: "u1",
          body: "Shipped the header.",
          created_at: "2026-03-03T09:00:00Z",
          author_id: STAFF_ID,
        },
      ],
      comments: [
        {
          id: "c1",
          update_id: "u1",
          body: "Looks good.",
          created_at: "2026-03-03T11:30:00Z",
          author_id: STAFF_ID,
        },
      ],
    });
    const html = await render();

    expect(html).toMatch(
      /<time[^>]*datetime="2026-03-03T09:00:00Z"[^>]*title="Mar 3, 2026"[^>]*>3 hours ago<\/time>/i,
    );
    expect(html).toMatch(/<time[^>]*>30 minutes ago<\/time>/);
    expect(text(html)).toContain("Shipped the header.");
    expect(text(html)).toContain("Looks good.");
    expect(html).not.toContain("No updates yet");
  });

  it("adds mime_type and created_at to the existing files select", async () => {
    const selects = stub({
      files: [
        {
          id: "f1",
          name: "spec.pdf",
          size_bytes: 1024,
          storage_path: "x",
          uploaded_by: STAFF_ID,
          mime_type: "application/pdf",
          created_at: "2026-03-01T10:00:00Z",
        },
      ],
    });
    const html = await render();

    expect(selects.project_files).toContain("mime_type");
    expect(selects.project_files).toContain("created_at");
    expect(text(html)).toContain("Mar 1, 2026");
  });

  it("keeps the textarea labels and placeholders", async () => {
    stub({
      updates: [
        {
          id: "u1",
          body: "Hello",
          created_at: "2026-03-03T09:00:00Z",
          author_id: STAFF_ID,
        },
      ],
    });
    const html = await render();

    expect(html).toContain('placeholder="Post an update for the client..."');
    expect(html).toContain('placeholder="Write a comment..."');
    expect(html.match(/data-slot="textarea"/g)?.length).toBe(2);
  });
});
