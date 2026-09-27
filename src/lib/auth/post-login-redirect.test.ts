import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolvePostAuthRedirect } from "@/lib/auth/post-login-redirect";

// `SupabaseClient` carries protected fields, so nothing structurally shaped
// like it - short of an actual instance - satisfies its type without a
// cast (same reasoning as `toActivitySupabaseClient`'s test in
// `src/lib/ai/activity.test.ts`). Building a real client with a fake
// `fetch` keeps this cast-free: the fake answers PostgREST requests by
// table instead of standing in for the client itself.
const BASE_URL = "http://localhost:54321";

function fakeSupabase(options: {
  membership?: { workspace_id: string } | null;
  workspace?: { slug: string } | null;
}) {
  const fetchMock: typeof fetch = (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname === "/rest/v1/workspace_members") {
      return Promise.resolve(
        new Response(
          JSON.stringify(options.membership ? [options.membership] : []),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    if (url.pathname === "/rest/v1/workspaces") {
      return Promise.resolve(
        new Response(
          JSON.stringify(options.workspace ? [options.workspace] : []),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    throw new Error(`unexpected request to ${url.pathname}`);
  };

  return createClient<Database>(BASE_URL, "test-anon-key", {
    global: { fetch: fetchMock },
  });
}

describe("resolvePostAuthRedirect", () => {
  it("returns the invite link when next points to one, without querying the database", async () => {
    const supabase = fakeSupabase({ membership: null, workspace: null });

    const redirectTo = await resolvePostAuthRedirect(
      supabase,
      "user-1",
      "/invite/abc123",
    );

    expect(redirectTo).toBe("/invite/abc123");
  });

  it("returns /onboarding when the user has no workspace", async () => {
    const supabase = fakeSupabase({ membership: null, workspace: null });

    const redirectTo = await resolvePostAuthRedirect(supabase, "user-1", null);

    expect(redirectTo).toBe("/onboarding");
  });

  it("returns the workspace path when the user already belongs to one", async () => {
    const supabase = fakeSupabase({
      membership: { workspace_id: "ws-1" },
      workspace: { slug: "acme-agency" },
    });

    const redirectTo = await resolvePostAuthRedirect(supabase, "user-1", null);

    expect(redirectTo).toBe("/w/acme-agency");
  });
});
