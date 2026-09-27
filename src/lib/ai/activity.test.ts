import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  loadProjectActivity,
  toActivitySupabaseClient,
} from "@/lib/ai/activity";
import type { ActivitySupabaseClient } from "@/lib/ai/activity";

const PROJECT_ID = "d0000000-0000-4000-8000-00000000000a";
const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const SINCE = new Date("2026-09-20T00:00:00.000Z");

type UpdateLikeRow = { created_at: string; body: string; author_id: string };
type FileLikeRow = { created_at: string; name: string; uploaded_by: string };

/** Builds a fake `ActivitySupabaseClient` from plain row arrays. */
function buildFakeSupabase(options: {
  project?: {
    name: string;
    status: string;
    clients: { name: string } | null;
    workspace_id: string;
  } | null;
  members?: {
    user_id: string;
    profiles: { full_name: string | null } | null;
  }[];
  updates?: UpdateLikeRow[];
  comments?: UpdateLikeRow[];
  files?: FileLikeRow[];
  projectError?: Error | null;
}): ActivitySupabaseClient {
  const project =
    options.project === undefined
      ? {
          name: "Website Redesign",
          status: "active",
          clients: { name: "Acme Inc" },
          workspace_id: WORKSPACE_ID,
        }
      : options.project;
  const projectError = options.projectError ?? null;
  const members = options.members ?? [];
  const updates = options.updates ?? [];
  const comments = options.comments ?? [];
  const files = options.files ?? [];

  function windowRows<T extends { created_at: string }>(
    rows: T[],
    sinceIso: string,
    limit: number,
  ) {
    return Promise.resolve({
      data: rows
        .filter((row) => row.created_at >= sinceIso)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit),
      error: null,
    });
  }

  return {
    loadProject: () =>
      Promise.resolve({
        data: projectError ? null : project,
        error: projectError,
      }),
    loadMembers: () => Promise.resolve({ data: members, error: null }),
    loadUpdates: (_projectId, sinceIso, limit) =>
      windowRows(updates, sinceIso, limit),
    loadComments: (_projectId, sinceIso, limit) =>
      windowRows(comments, sinceIso, limit),
    loadFiles: (_projectId, sinceIso, limit) =>
      windowRows(files, sinceIso, limit),
  };
}

describe("loadProjectActivity", () => {
  it("returns the project's name, client and status alongside the items", async () => {
    const supabase = buildFakeSupabase({
      updates: [
        {
          created_at: "2026-09-25T00:00:00.000Z",
          body: "Shipped v1",
          author_id: "u1",
        },
      ],
      members: [{ user_id: "u1", profiles: { full_name: "Jane Doe" } }],
    });

    const activity = await loadProjectActivity(supabase, PROJECT_ID, SINCE);

    expect(activity.projectName).toBe("Website Redesign");
    expect(activity.clientName).toBe("Acme Inc");
    expect(activity.status).toBe("active");
    expect(activity.items).toEqual([
      {
        kind: "update",
        authorName: "Jane Doe",
        createdAt: "2026-09-25T00:00:00.000Z",
        text: "Shipped v1",
      },
    ]);
  });

  it("returns no items when nothing happened in the window", async () => {
    const supabase = buildFakeSupabase({});

    const activity = await loadProjectActivity(supabase, PROJECT_ID, SINCE);

    expect(activity.items).toEqual([]);
  });

  it("only includes rows on or after `since` (the 7-day boundary)", async () => {
    const supabase = buildFakeSupabase({
      updates: [
        {
          created_at: "2026-09-19T23:59:59.000Z",
          body: "Too old",
          author_id: "u1",
        },
        {
          created_at: "2026-09-20T00:00:00.000Z",
          body: "Right on the boundary",
          author_id: "u1",
        },
      ],
      members: [{ user_id: "u1", profiles: { full_name: "Jane Doe" } }],
    });

    const activity = await loadProjectActivity(supabase, PROJECT_ID, SINCE);

    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]?.text).toBe("Right on the boundary");
  });

  it("caps items to 50, newest first", async () => {
    const updates = Array.from({ length: 60 }, (_, index) => ({
      created_at: new Date(SINCE.getTime() + index * 1000).toISOString(),
      body: `Update ${index}`,
      author_id: "u1",
    }));
    const supabase = buildFakeSupabase({
      updates,
      members: [{ user_id: "u1", profiles: { full_name: "Jane Doe" } }],
    });

    const activity = await loadProjectActivity(supabase, PROJECT_ID, SINCE);

    expect(activity.items).toHaveLength(50);
    // Newest first: index 59 has the latest timestamp.
    expect(activity.items[0]?.text).toBe("Update 59");
  });

  it("caps combined text to 12,000 characters, truncating the item that crosses it", async () => {
    const first = "a".repeat(11_990);
    const second = "b".repeat(100);
    const supabase = buildFakeSupabase({
      updates: [
        {
          created_at: "2026-09-26T00:00:00.000Z",
          body: second,
          author_id: "u1",
        },
        {
          created_at: "2026-09-25T00:00:00.000Z",
          body: first,
          author_id: "u1",
        },
      ],
      members: [{ user_id: "u1", profiles: { full_name: "Jane Doe" } }],
    });

    const activity = await loadProjectActivity(supabase, PROJECT_ID, SINCE);

    const totalChars = activity.items.reduce(
      (sum, item) => sum + item.text.length,
      0,
    );
    expect(totalChars).toBeLessThanOrEqual(12_000);
    expect(activity.items).toHaveLength(2);
    expect(activity.items[0]?.text).toBe(second);
    expect(activity.items[1]?.text.endsWith("…")).toBe(true);
    expect(activity.items[1]?.text.length).toBeLessThan(first.length);
  });

  it("throws when a query returns an error", async () => {
    const supabase = buildFakeSupabase({ projectError: new Error("boom") });

    await expect(
      loadProjectActivity(supabase, PROJECT_ID, SINCE),
    ).rejects.toThrow("boom");
  });
});

// `toActivitySupabaseClient` is exercised against a real
// `SupabaseClient<Database>` (from `createClient`) rather than a plain
// object typed as one: `SupabaseClient` carries `protected` fields, so
// nothing structurally shaped like it - short of an actual instance -
// satisfies its type without a cast. Its `fetch` option is a real
// extension point instead, so the adapter's outgoing requests can be
// recorded and inspected there with no cast anywhere in this file.
describe("toActivitySupabaseClient", () => {
  const BASE_URL = "http://localhost:54321";

  function buildRecordingClient() {
    const requests: URL[] = [];
    const fetchMock: typeof fetch = (input) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      requests.push(url);
      return Promise.resolve(
        new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    const client = createClient<Database>(BASE_URL, "test-anon-key", {
      global: { fetch: fetchMock },
    });
    return { client, requests };
  }

  it("loadProject selects the right columns and filters by id", async () => {
    const { client, requests } = buildRecordingClient();
    const adapter = toActivitySupabaseClient(client);

    await adapter.loadProject(PROJECT_ID);

    expect(requests).toHaveLength(1);
    const [url] = requests;
    expect(url?.pathname).toBe("/rest/v1/projects");
    expect(url?.searchParams.get("select")).toBe(
      "name,status,clients(name),workspace_id",
    );
    expect(url?.searchParams.get("id")).toBe(`eq.${PROJECT_ID}`);
  });

  it("loadMembers selects the right columns and filters by workspace_id", async () => {
    const { client, requests } = buildRecordingClient();
    const adapter = toActivitySupabaseClient(client);

    await adapter.loadMembers(WORKSPACE_ID);

    const [url] = requests;
    expect(url?.pathname).toBe("/rest/v1/workspace_members");
    expect(url?.searchParams.get("select")).toBe("user_id,profiles(full_name)");
    expect(url?.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE_ID}`);
  });

  it("loadUpdates filters by project_id and the activity window, ordered newest first with the given limit", async () => {
    const { client, requests } = buildRecordingClient();
    const adapter = toActivitySupabaseClient(client);
    const sinceIso = SINCE.toISOString();

    await adapter.loadUpdates(PROJECT_ID, sinceIso, 50);

    const [url] = requests;
    expect(url?.pathname).toBe("/rest/v1/project_updates");
    expect(url?.searchParams.get("select")).toBe("body,created_at,author_id");
    expect(url?.searchParams.get("project_id")).toBe(`eq.${PROJECT_ID}`);
    expect(url?.searchParams.get("created_at")).toBe(`gte.${sinceIso}`);
    expect(url?.searchParams.get("order")).toBe("created_at.desc");
    expect(url?.searchParams.get("limit")).toBe("50");
  });

  it("loadComments filters by project_id and the activity window, ordered newest first with the given limit", async () => {
    const { client, requests } = buildRecordingClient();
    const adapter = toActivitySupabaseClient(client);
    const sinceIso = SINCE.toISOString();

    await adapter.loadComments(PROJECT_ID, sinceIso, 50);

    const [url] = requests;
    expect(url?.pathname).toBe("/rest/v1/update_comments");
    expect(url?.searchParams.get("select")).toBe("body,created_at,author_id");
    expect(url?.searchParams.get("project_id")).toBe(`eq.${PROJECT_ID}`);
    expect(url?.searchParams.get("created_at")).toBe(`gte.${sinceIso}`);
    expect(url?.searchParams.get("order")).toBe("created_at.desc");
    expect(url?.searchParams.get("limit")).toBe("50");
  });

  it("loadFiles filters by project_id and the activity window, ordered newest first with the given limit", async () => {
    const { client, requests } = buildRecordingClient();
    const adapter = toActivitySupabaseClient(client);
    const sinceIso = SINCE.toISOString();

    await adapter.loadFiles(PROJECT_ID, sinceIso, 50);

    const [url] = requests;
    expect(url?.pathname).toBe("/rest/v1/project_files");
    expect(url?.searchParams.get("select")).toBe("name,created_at,uploaded_by");
    expect(url?.searchParams.get("project_id")).toBe(`eq.${PROJECT_ID}`);
    expect(url?.searchParams.get("created_at")).toBe(`gte.${sinceIso}`);
    expect(url?.searchParams.get("order")).toBe("created_at.desc");
    expect(url?.searchParams.get("limit")).toBe("50");
  });
});
