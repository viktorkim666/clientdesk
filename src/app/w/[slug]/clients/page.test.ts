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

import ClientsPage from "./page";

function workspace() {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: WORKSPACE_SLUG,
    role: "owner" as const,
    clientId: null,
    userId: "00000001-0000-4000-8000-000000000001",
  };
}

/** Resolves only once `resolve()` is called, so the test can prove a
 * producer function ran before its result was awaited. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
});

describe("ClientsPage", () => {
  it("starts the clients and billing reads together instead of one after the other", async () => {
    const clientsDeferred = deferred<{
      data: {
        id: string;
        name: string;
        created_at: string;
        projects: { count: number }[];
        workspace_members: { count: number }[];
        invitations: { accepted_at: string | null; expires_at: string }[];
      }[];
    }>();
    const billingDeferred = deferred<{ count: number }>();
    let clientsQueryStarted = false;
    let billingQueryStarted = false;

    createClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table === "clients") {
          return {
            select: () => ({
              eq: () => ({
                order: () => {
                  // Marks the moment the clients query is actually issued,
                  // not the moment its result is awaited.
                  clientsQueryStarted = true;
                  return clientsDeferred.promise;
                },
              }),
            }),
          };
        }
        if (table === "workspace_billing") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => {
                  billingQueryStarted = true;
                  return billingDeferred.promise;
                },
              }),
            }),
          };
        }
        throw new Error(`from() was not stubbed for table "${table}"`);
      },
    });

    const pagePromise = ClientsPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
    });

    // Let the microtask queue run up to the point both reads are issued,
    // without letting either resolve. Sequential `await`s would only have
    // started the clients query by now; `Promise.all` starts both.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(clientsQueryStarted).toBe(true);
    expect(billingQueryStarted).toBe(true);

    clientsDeferred.resolve({
      data: [
        {
          id: "c1",
          name: "Client One Co.",
          created_at: "2026-03-03T10:00:00Z",
          projects: [{ count: 0 }],
          workspace_members: [{ count: 0 }],
          invitations: [],
        },
      ],
    });
    billingDeferred.resolve({ count: 0 });

    const result = await pagePromise;
    expect(result).toBeTruthy();
  });

  describe("rendering", () => {
    type Row = Record<string, unknown>;

    it.each(["clients", "workspace_billing"])(
      "throws when the %s read fails instead of rendering an empty list",
      async (failingTable) => {
        const failure = new Error(`${failingTable} failed`);
        createClientMock.mockResolvedValue({
          from: (table: string) =>
            table === "clients"
              ? {
                  select: () => ({
                    eq: () => ({
                      order: () =>
                        Promise.resolve(
                          failingTable === "clients"
                            ? { data: null, error: failure }
                            : { data: [] },
                        ),
                    }),
                  }),
                }
              : {
                  select: () => ({
                    eq: () => ({
                      maybeSingle: () =>
                        Promise.resolve(
                          failingTable === "workspace_billing"
                            ? { data: null, error: failure }
                            : { data: null },
                        ),
                    }),
                  }),
                },
        });

        await expect(
          ClientsPage({ params: Promise.resolve({ slug: WORKSPACE_SLUG }) }),
        ).rejects.toBe(failure);
      },
    );

    function stub(clients: Row[], subscriptionStatus: string | null) {
      const selects: string[] = [];
      createClientMock.mockResolvedValue({
        from: (table: string) =>
          table === "clients"
            ? {
                select: (columns: string) => {
                  selects.push(columns);
                  return {
                    eq: () => ({
                      order: () => Promise.resolve({ data: clients }),
                    }),
                  };
                },
              }
            : {
                select: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: subscriptionStatus
                          ? { subscription_status: subscriptionStatus }
                          : null,
                      }),
                  }),
                }),
              },
      });
      return selects;
    }

    async function render() {
      const element = await ClientsPage({
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

    const client = (id: string, name: string, count: number) => ({
      id,
      name,
      created_at: "2026-03-03T10:00:00Z",
      projects: [{ count }],
      workspace_members: [{ count: 0 }],
      invitations: [],
    });
    const newClientButtons = (html: string) =>
      html.match(/<button[^>]*>New client<\/button>/g) ?? [];

    it("renders the header, the project count and the added date from the select", async () => {
      const selects = stub([client("c1", "Acme Co.", 3)], null);
      const html = await render();

      expect(html).toMatch(/<h1[^>]*>Clients<\/h1>\s*<p[^>]*>[^<]+<\/p>/);
      expect(selects).toEqual([
        "id, name, created_at, projects(count), workspace_members(count), invitations(accepted_at, expires_at)",
      ]);
      expect(html).toMatch(/<th[^>]*>Projects<\/th>/);
      expect(html).toMatch(/<th[^>]*>Added<\/th>/);
      expect(html).toMatch(/<td[^>]*>[^]*Acme Co\.<\/span><\/td>/);
      expect(text(html)).toContain("3");
      expect(text(html)).toContain("Mar 3, 2026");
      expect(newClientButtons(html)).toHaveLength(1);
    });

    it("gives staff a menu named after each client, in an actions column", async () => {
      stub([client("c1", "Acme Co.", 0), client("c2", "Globex", 0)], null);
      const html = await render();

      expect(html).toContain('aria-label="Actions for Acme Co."');
      expect(html).toContain('aria-label="Actions for Globex"');
      expect(html).toMatch(/<th[^>]*><span[^>]*>Actions<\/span><\/th>/);
    });

    it("gives a member the same menus", async () => {
      getCurrentWorkspaceMock.mockResolvedValue({
        ...workspace(),
        role: "member",
      });
      stub([client("c1", "Acme Co.", 0)], null);
      const html = await render();

      expect(html).toContain('aria-label="Actions for Acme Co."');
    });

    it("gives a client-role viewer no actions column", async () => {
      getCurrentWorkspaceMock.mockResolvedValue({
        ...workspace(),
        role: "client",
      });
      stub([client("c1", "Acme Co.", 0)], null);
      const html = await render();

      expect(html).not.toContain("Actions for");
      expect(html).not.toContain(">Actions<");
      expect(html.match(/<th[ >]/g)).toHaveLength(3);
    });

    it("keeps the usage count equal to the number of clients", async () => {
      stub([client("c1", "A", 4), client("c2", "B", 0)], null);
      const html = await render();

      expect(text(html)).toContain("2 / 2 clients used.");
    });

    it("shows the Free usage text and an accessible progress bar", async () => {
      stub([client("c1", "A", 0), client("c2", "B", 0)], null);
      const html = await render();

      expect(text(html)).toContain("2 / 2 clients used.");
      expect(html).toMatch(/role="progressbar"[^>]*aria-label="[^"]+"/);
      expect(html).toContain('aria-valuenow="2"');
      expect(html).toContain('aria-valuemax="2"');
      expect(html).toContain("Upgrade to Pro");
    });

    function callout(html: string) {
      const start = html.indexOf('data-slot="usage-callout"');
      return start === -1 ? "" : html.slice(start, start + 3000);
    }

    it("groups the usage text and its progress bar in one callout", async () => {
      stub([client("c1", "A", 0)], null);
      const html = await render();

      expect(text(callout(html))).toContain("1 / 2 clients used.");
      expect(callout(html)).toContain('role="progressbar"');
    });

    it("says the limit is reached in text and an icon, not color alone", async () => {
      stub([client("c1", "A", 0), client("c2", "B", 0)], null);
      const html = await render();

      expect(text(callout(html))).toContain("Limit reached");
      expect(callout(html)).toMatch(
        /lucide-triangle-alert[^>]*aria-hidden="true"/,
      );
      expect(callout(html)).toContain("Upgrade to Pro");
    });

    it("shows no limit warning below the limit", async () => {
      stub([client("c1", "A", 0)], null);
      const html = await render();

      expect(text(html)).not.toContain("Limit reached");
      expect(html).not.toContain("Upgrade to Pro");
    });

    it("hides the usage text and bar on Pro", async () => {
      stub([client("c1", "A", 0)], "active");
      const html = await render();

      expect(text(html)).not.toContain("clients used.");
      expect(html).not.toContain('role="progressbar"');
    });

    it("moves the New client trigger into the empty state", async () => {
      stub([], null);
      const html = await render();

      expect(text(html)).toContain("Add your first client");
      expect(newClientButtons(html)).toHaveLength(1);
      expect(html.indexOf("New client")).toBeGreaterThan(
        html.indexOf("Add your first client"),
      );
      expect(html).not.toContain("<table");
      expect(text(html)).toContain("0 / 2 clients used.");
    });

    it("explains an empty list to a member-less viewer without an action", async () => {
      getCurrentWorkspaceMock.mockResolvedValue({
        ...workspace(),
        role: "client",
      });
      stub([], null);
      const html = await render();

      expect(newClientButtons(html)).toHaveLength(0);
      expect(text(html)).toContain("No clients yet");
    });
  });
});
