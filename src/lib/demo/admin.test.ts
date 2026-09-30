import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toDemoAdminClient } from "./admin";
import type { Database } from "@/types/database";

const USER_ID = "8a3f2c1e-5b7d-4c9a-9e1f-0a2b3c4d5e6f";

function setup() {
  const fetchMock = vi.fn((input: string) => {
    void input;
    return Promise.resolve(
      new Response(JSON.stringify({ workspace_id: "w1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { admin: toDemoAdminClient(client), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toDemoAdminClient findSandboxByUser", () => {
  it("looks the user up in all four user columns", async () => {
    const { admin, fetchMock } = setup();

    const { data, error } = await admin.db.findSandboxByUser(USER_ID);

    expect(error).toBeNull();
    expect(data).toMatchObject({ workspace_id: "w1" });
    const url = decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]));
    for (const column of [
      "owner_user_id",
      "member_user_id",
      "client_one_user_id",
      "client_two_user_id",
    ]) {
      expect(url).toContain(`${column}.eq.${USER_ID}`);
    }
  });

  it.each([
    "x,owner_user_id.neq.0",
    "abc)",
    "",
    "8a3f2c1e-5b7d-4c9a-9e1f-0a2b3c4d5e6f,id.gt.0",
  ])(
    "refuses %j without sending a request that could add filters",
    async (id) => {
      const { admin, fetchMock } = setup();

      const { data, error } = await admin.db.findSandboxByUser(id);

      expect(data).toBeNull();
      expect(error).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
