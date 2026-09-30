import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";

const { getCurrentWorkspaceMock, createClientMock, isDemoWorkspaceMock } =
  vi.hoisted(() => ({
    getCurrentWorkspaceMock: vi.fn(),
    createClientMock: vi.fn(),
    isDemoWorkspaceMock: vi.fn<() => Promise<boolean>>(),
  }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));
vi.mock("@/lib/demo/is-demo-workspace", () => ({
  isDemoWorkspace: isDemoWorkspaceMock,
}));
vi.mock("./actions", () => ({
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  inviteMember: vi.fn(),
}));

import MembersPage from "./page";

type Row = Record<string, unknown>;

function workspace(role: "owner" | "member" | "client" = "owner") {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: WORKSPACE_SLUG,
    role,
    clientId: null,
    userId: "00000001-0000-4000-8000-000000000001",
  };
}

function stub(members: Row[], invitations: Row[]) {
  createClientMock.mockResolvedValue({
    from: (table: string) => {
      if (table === "workspace_members") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: members }) }),
        };
      }
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ id: "c1", name: "A" }] }),
            }),
          }),
        };
      }
      if (table === "invitations") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => Promise.resolve({ data: invitations }),
              }),
            }),
          }),
        };
      }
      throw new Error(`from() was not stubbed for table "${table}"`);
    },
  });
}

async function render() {
  const element = await MembersPage({
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

const member = (
  userId: string,
  role: string,
  name: string,
  client?: string,
) => ({
  user_id: userId,
  role,
  profiles: { full_name: name },
  clients: client ? { name: client } : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
  isDemoWorkspaceMock.mockResolvedValue(false);
});

describe("MembersPage", () => {
  it("asks whether this is a sandbox while the table reads are still open", async () => {
    const sandboxAsked = Promise.withResolvers<void>();
    isDemoWorkspaceMock.mockImplementation(() => {
      sandboxAsked.resolve();
      return Promise.resolve(false);
    });
    // Every table read stays open forever.
    const never = new Promise<never>(() => undefined);
    const chain: Record<string, unknown> = { then: never.then.bind(never) };
    for (const method of ["select", "eq", "is", "order"]) {
      chain[method] = () => chain;
    }
    createClientMock.mockResolvedValue({ from: () => chain });

    void MembersPage({ params: Promise.resolve({ slug: WORKSPACE_SLUG }) });

    // The table reads never resolve here, so a page that awaited the reads
    // one by one would not have reached the sandbox check.
    await Promise.race([
      sandboxAsked.promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("sandbox check not started")), 200),
      ),
    ]);
    expect(isDemoWorkspaceMock).toHaveBeenCalledTimes(1);
  });

  it("disables Invite and explains why in a sandbox workspace", async () => {
    isDemoWorkspaceMock.mockResolvedValue(true);
    stub([member("u1", "owner", "Ada Lovelace")], []);
    const html = await render();

    expect(isDemoWorkspaceMock).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
    );
    expect(html).toMatch(
      /<button[^>]*aria-disabled="true"[^>]*>Invite<\/button>/,
    );
    expect(text(html)).toContain(
      "Invites are turned off in the demo workspace.",
    );
  });

  it("renders the header with a description and a single Invite button", async () => {
    stub([member("u1", "owner", "Ada Lovelace")], []);
    const html = await render();

    expect(html).toMatch(/<h1[^>]*>Members<\/h1>\s*<p[^>]*>[^<]+<\/p>/);
    expect(html.match(/<button[^>]*>Invite<\/button>/g)).toHaveLength(1);
  });

  it("keeps table semantics on the members table below sm with explicit roles", async () => {
    stub([member("u1", "owner", "Ada Lovelace")], []);
    const html = await render();
    const table = html.match(
      /<table[^>]*aria-label="Members"[^]*?<\/table>/,
    )?.[0];

    expect(table).toBeDefined();
    expect(table).toMatch(/<thead[^>]*role="rowgroup"/);
    expect(table).toMatch(/<tbody[^>]*role="rowgroup"/);
    expect(table?.match(/<th[^>]*role="columnheader"/g)).toHaveLength(4);
    expect(table?.match(/<th\b/g)).toHaveLength(4);
    expect(table?.match(/<tr[^>]*role="row"/g)).toHaveLength(2);
  });

  it("renders each member with a hidden avatar next to the name", async () => {
    stub(
      [
        member("u1", "owner", "Ada Lovelace"),
        member("u2", "member", "Grace Hopper"),
      ],
      [],
    );
    const html = await render();

    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>[^]*?AL[^]*?<\/span>\s*<span[^>]*>Ada Lovelace<\/span>/,
    );
    expect(text(html)).toContain("Grace Hopper");
    expect(html).toContain('aria-label="Role for Grace Hopper"');
  });

  it("names both tables and ties the invitations section to its heading", async () => {
    stub(
      [member("u1", "owner", "Ada")],
      [
        {
          id: "i1",
          email: "soon@example.com",
          role: "member",
          expires_at: "2099-06-18T12:00:00Z",
        },
      ],
    );
    const html = await render();

    expect(html).toMatch(/<table[^>]*aria-label="Members"/);
    expect(html).toMatch(/<table[^>]*aria-label="Pending invitations"/);
    const headingId = html.match(
      /<h2[^>]*id="([^"]+)"[^>]*>Pending invitations<\/h2>/,
    )?.[1];
    expect(headingId).toBeTruthy();
    expect(html).toContain(`<section aria-labelledby="${headingId}"`);
  });

  it("names each Remove button after its member, starting with the visible word", async () => {
    stub(
      [
        member("u1", "owner", "Ada Lovelace"),
        member("u2", "member", "Grace Hopper"),
      ],
      [],
    );
    const html = await render();

    expect(html).toMatch(
      /<button[^>]*aria-label="Remove Grace Hopper"[^>]*>Remove<\/button>/,
    );
  });

  it("shows sentence-case role labels in the select triggers and a dash for no client", async () => {
    stub(
      [
        member("u1", "owner", "Ada"),
        member("u3", "owner", "Alan"),
        member("u2", "member", "Grace"),
      ],
      [],
    );
    const html = await render();

    expect(html.match(/data-slot="select-value"[^>]*>([^<]*)/g)).toEqual([
      expect.stringMatching(/>Owner$/),
      expect.stringMatching(/>Owner$/),
      expect.stringMatching(/>Member$/),
    ]);
    expect(html).toContain("—");
  });

  it("shows a role badge instead of a select when the role is read-only", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("member"));
    stub([member("u1", "client", "Cleo Client", "Acme Co.")], []);
    const html = await render();

    expect(html).not.toContain('aria-label="Role for Cleo Client"');
    expect(html).toMatch(/<span[^>]*data-slot="badge"[^>]*>Client<\/span>/);
    expect(text(html)).toContain("Acme Co.");
  });

  it("shows pending invitations with a role badge, expiry text and absolute date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    stub(
      [member("u1", "owner", "Ada")],
      [
        {
          id: "i1",
          email: "soon@example.com",
          role: "member",
          expires_at: "2026-06-18T12:00:00Z",
        },
        {
          id: "i2",
          email: "late@example.com",
          role: "client",
          expires_at: "2026-06-10T12:00:00Z",
        },
      ],
    );
    const html = await render();

    expect(html).toMatch(/<h2[^>]*>Pending invitations<\/h2>/);
    expect(text(html)).toContain("soon@example.com");
    expect(text(html)).toContain("Expires in 3 days");
    expect(text(html)).toContain("Expired");
    expect(html).toMatch(/<time[^>]*title="Jun 18, 2026"/);
    expect(html).not.toContain("No pending invitations");
  });

  it("hides the Client column below sm and shows the client under the member name", async () => {
    getCurrentWorkspaceMock.mockResolvedValue(workspace("member"));
    stub([member("u1", "client", "Cleo Client", "Acme Co.")], []);
    const html = await render();

    expect(html).toMatch(/<th[^>]*hidden sm:table-cell[^>]*>Client<\/th>/);
    expect(html).toMatch(
      /Cleo Client<\/span><span[^>]*\bsm:hidden\b[^>]*>Acme Co\.<\/span>/,
    );
    expect(html).toMatch(/<td[^>]*hidden sm:table-cell[^>]*>Acme Co\.<\/td>/);
  });

  it("omits the second line for a member without a client", async () => {
    stub([member("u1", "owner", "Ada")], []);
    const html = await render();

    expect(html).not.toMatch(/Ada<\/span><span/);
  });

  it("shows the invitation expiry under the email below sm", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    stub(
      [member("u1", "owner", "Ada")],
      [
        {
          id: "i1",
          email: "soon@example.com",
          role: "member",
          expires_at: "2026-06-18T12:00:00Z",
        },
      ],
    );
    const html = await render();

    expect(html).toMatch(/<th[^>]*hidden sm:table-cell[^>]*>Expires<\/th>/);
    expect(html).toMatch(
      /soon@example\.com<time[^>]*\bsm:hidden\b[^>]*>Expires in 3 days<\/time><\/td>/,
    );
  });

  it("explains an empty invitation list without a second Invite button", async () => {
    stub([member("u1", "owner", "Ada")], []);
    const html = await render();

    expect(text(html)).toContain("No pending invitations");
    expect(html.match(/<button[^>]*>Invite<\/button>/g)).toHaveLength(1);
  });
});
