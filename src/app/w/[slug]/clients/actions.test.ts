import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";

const { insertMock, revalidatePathMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({ insert: insertMock }),
  }),
}));

import { createClientCompany } from "./actions";

function formData(name: string): FormData {
  const data = new FormData();
  data.set("name", name);
  return data;
}

beforeEach(() => {
  insertMock.mockReset();
  revalidatePathMock.mockClear();
});

describe("createClientCompany", () => {
  it("creates the client and revalidates the clients page", async () => {
    insertMock.mockResolvedValue({ error: null });

    const result = await createClientCompany(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      formData("Acme Client Co."),
    );

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/clients`,
    );
  });

  it("maps the Free plan limit error to an upgrade message", async () => {
    insertMock.mockResolvedValue({
      error: { code: "CD001", message: "plan_limit_clients" },
    });

    const result = await createClientCompany(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      formData("One Too Many Co."),
    );

    expect(result).toEqual({
      ok: false,
      error: "The Free plan allows 2 clients. Upgrade to Pro to add more.",
    });
  });

  it("returns a generic error for any other database failure", async () => {
    insertMock.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    const result = await createClientCompany(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      formData("Acme Client Co."),
    );

    expect(result).toEqual({ ok: false, error: "Could not create the client" });
  });
});
