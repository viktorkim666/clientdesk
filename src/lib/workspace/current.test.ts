import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { getCurrentWorkspace } from "@/lib/workspace/current";

// `SupabaseServerClient` (`Awaited<ReturnType<typeof createClient>>` in
// `src/lib/supabase/server.ts`) resolves to a real `SupabaseClient`
// instance, which carries protected fields - nothing structurally shaped
// like it satisfies its type without a cast (same reasoning as
// `toActivitySupabaseClient`'s test in `src/lib/ai/activity.test.ts`).
// Building a real client (`createServerClient`'s and `createClient`'s
// return types are the same `SupabaseClient<Database, "public">`) with a
// fake `fetch` keeps this cast-free: the fake answers the auth and
// PostgREST requests `getCurrentWorkspace` triggers, by request path.
const BASE_URL = "http://localhost:54321";
const USER_ID = "user-1";

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A JWT `getClaims()` can decode locally: HS256 so it falls back to
 * verifying against the fake `/auth/v1/user` endpoint below rather than
 * needing a real signature. */
function buildAccessToken(sub: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub,
      aud: "authenticated",
      role: "authenticated",
      email: "user@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${header}.${payload}.${base64url("signature")}`;
}

type QueryResult = { data: unknown; error: unknown };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Answers a table's PostgREST `maybeSingle()` request: an array wrapping
 * the row (or empty) for success, or a non-2xx body for a query error. */
function tableResponse(result: QueryResult) {
  if (result.error) {
    return jsonResponse(result.error, 500);
  }
  return jsonResponse(result.data ? [result.data] : []);
}

async function fakeSupabase(options: {
  signedIn: boolean;
  workspaceResult?: QueryResult;
  membershipResult?: QueryResult;
}) {
  const fetchMock: typeof fetch = (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );

    if (url.pathname === "/auth/v1/user") {
      return Promise.resolve(
        jsonResponse({
          id: USER_ID,
          aud: "authenticated",
          role: "authenticated",
          email: "user@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        }),
      );
    }
    if (url.pathname === "/rest/v1/workspaces") {
      return Promise.resolve(
        tableResponse(options.workspaceResult ?? { data: null, error: null }),
      );
    }
    if (url.pathname === "/rest/v1/workspace_members") {
      return Promise.resolve(
        tableResponse(options.membershipResult ?? { data: null, error: null }),
      );
    }
    throw new Error(`unexpected request to ${url.pathname}`);
  };

  const client = createClient<Database>(BASE_URL, "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchMock },
  });

  if (options.signedIn) {
    await client.auth.setSession({
      access_token: buildAccessToken(USER_ID),
      refresh_token: "refresh-token",
    });
  }

  return client;
}

describe("getCurrentWorkspace", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("calls notFound when the user is signed out", async () => {
    const supabase = await fakeSupabase({ signedIn: false });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound when the workspace genuinely doesn't exist", async () => {
    const supabase = await fakeSupabase({ signedIn: true });

    await expect(getCurrentWorkspace(supabase, "unknown-slug")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("throws the real query error instead of calling notFound", async () => {
    const supabase = await fakeSupabase({
      signedIn: true,
      workspaceResult: { data: null, error: { message: "connection reset" } },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "connection reset",
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the user isn't a member of an existing workspace", async () => {
    const supabase = await fakeSupabase({
      signedIn: true,
      workspaceResult: {
        data: { id: "ws-1", name: "Acme", slug: "acme" },
        error: null,
      },
      membershipResult: { data: null, error: null },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("throws a real membership query error instead of calling notFound", async () => {
    const supabase = await fakeSupabase({
      signedIn: true,
      workspaceResult: {
        data: { id: "ws-1", name: "Acme", slug: "acme" },
        error: null,
      },
      membershipResult: { data: null, error: { message: "timeout" } },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "timeout",
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("returns the resolved workspace when everything succeeds", async () => {
    const supabase = await fakeSupabase({
      signedIn: true,
      workspaceResult: {
        data: { id: "ws-1", name: "Acme", slug: "acme" },
        error: null,
      },
      membershipResult: {
        data: { role: "owner", client_id: null },
        error: null,
      },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).resolves.toEqual({
      id: "ws-1",
      name: "Acme",
      slug: "acme",
      role: "owner",
      clientId: null,
      userId: USER_ID,
      userEmail: "user@example.com",
    });
  });
});
