import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createClient } from "@/lib/supabase/server";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { getCurrentWorkspace } from "@/lib/workspace/current";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type QueryResult = { data: unknown; error: unknown };

function fakeSupabase(options: {
  claims: unknown;
  workspaceResult: QueryResult;
  membershipResult?: QueryResult;
}): SupabaseServerClient {
  const chain = (result: QueryResult) => ({
    select: () => chain(result),
    eq: () => chain(result),
    maybeSingle: () => result,
  });

  const fake = {
    auth: { getClaims: () => ({ data: options.claims }) },
    from: (table: string) =>
      table === "workspaces"
        ? chain(options.workspaceResult)
        : chain(options.membershipResult ?? { data: null, error: null }),
  };

  return fake as unknown as SupabaseServerClient;
}

describe("getCurrentWorkspace", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it("calls notFound when the user is signed out", async () => {
    const supabase = fakeSupabase({
      claims: null,
      workspaceResult: { data: null, error: null },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound when the workspace genuinely doesn't exist", async () => {
    const supabase = fakeSupabase({
      claims: { claims: { sub: "user-1" } },
      workspaceResult: { data: null, error: null },
    });

    await expect(getCurrentWorkspace(supabase, "unknown-slug")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("throws the real query error instead of calling notFound", async () => {
    const supabase = fakeSupabase({
      claims: { claims: { sub: "user-1" } },
      workspaceResult: { data: null, error: { message: "connection reset" } },
    });

    await expect(getCurrentWorkspace(supabase, "acme")).rejects.toThrow(
      "connection reset",
    );
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the user isn't a member of an existing workspace", async () => {
    const supabase = fakeSupabase({
      claims: { claims: { sub: "user-1" } },
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
    const supabase = fakeSupabase({
      claims: { claims: { sub: "user-1" } },
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
    const supabase = fakeSupabase({
      claims: { claims: { sub: "user-1" } },
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
      userId: "user-1",
    });
  });
});
