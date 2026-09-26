import { describe, expect, it } from "vitest";
import { resolvePostAuthRedirect } from "@/lib/auth/post-login-redirect";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Chain = { data: unknown };

function fakeSupabase(
  membership: Chain,
  workspace: Chain,
): SupabaseClient<Database> {
  const chain = (result: Chain) => ({
    select: () => chain(result),
    eq: () => chain(result),
    limit: () => chain(result),
    maybeSingle: () => result,
  });

  return {
    from: (table: string) =>
      table === "workspace_members" ? chain(membership) : chain(workspace),
  } as unknown as SupabaseClient<Database>;
}

describe("resolvePostAuthRedirect", () => {
  it("returns the invite link when next points to one, without querying the database", async () => {
    const supabase = fakeSupabase({ data: null }, { data: null });

    const redirectTo = await resolvePostAuthRedirect(
      supabase,
      "user-1",
      "/invite/abc123",
    );

    expect(redirectTo).toBe("/invite/abc123");
  });

  it("returns /onboarding when the user has no workspace", async () => {
    const supabase = fakeSupabase({ data: null }, { data: null });

    const redirectTo = await resolvePostAuthRedirect(supabase, "user-1", null);

    expect(redirectTo).toBe("/onboarding");
  });

  it("returns the workspace path when the user already belongs to one", async () => {
    const supabase = fakeSupabase(
      { data: { workspace_id: "ws-1" } },
      { data: { slug: "acme-agency" } },
    );

    const redirectTo = await resolvePostAuthRedirect(supabase, "user-1", null);

    expect(redirectTo).toBe("/w/acme-agency");
  });
});
