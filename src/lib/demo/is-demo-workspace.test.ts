import { describe, expect, it, vi } from "vitest";
import {
  isDemoWorkspace,
  type DemoSandboxLookupClient,
} from "@/lib/demo/is-demo-workspace";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";

function clientReturning(
  result: { data: { id: string } | null; error: Error | null },
  filter = vi.fn<(expression: string) => void>(),
): DemoSandboxLookupClient {
  return {
    from: () => ({
      select: () => ({
        or: (expression) => {
          filter(expression);
          return {
            limit: () => ({ maybeSingle: () => Promise.resolve(result) }),
          };
        },
      }),
    }),
  };
}

describe("isDemoWorkspace", () => {
  it("is true when the user can see a sandbox row for the workspace", async () => {
    const filter = vi.fn<(expression: string) => void>();
    const client = clientReturning({ data: { id: "s1" }, error: null }, filter);

    await expect(isDemoWorkspace(client, WORKSPACE_ID)).resolves.toBe(true);
    expect(filter).toHaveBeenCalledWith(
      `workspace_id.eq.${WORKSPACE_ID},free_workspace_id.eq.${WORKSPACE_ID}`,
    );
  });

  it("is false when no sandbox row is visible", async () => {
    const client = clientReturning({ data: null, error: null });

    await expect(isDemoWorkspace(client, WORKSPACE_ID)).resolves.toBe(false);
  });

  it("throws when the lookup fails, so a caller never treats an error as 'not a sandbox'", async () => {
    const client = clientReturning({ data: null, error: new Error("boom") });

    await expect(isDemoWorkspace(client, WORKSPACE_ID)).rejects.toThrow("boom");
  });

  it("is false without querying when the id is not a UUID (no filter injection)", async () => {
    const filter = vi.fn<(expression: string) => void>();
    const client = clientReturning({ data: { id: "s1" }, error: null }, filter);

    await expect(isDemoWorkspace(client, "x,workspace_id.neq.0")).resolves.toBe(
      false,
    );
    expect(filter).not.toHaveBeenCalled();
  });
});
