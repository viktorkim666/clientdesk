import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";

const CLIENT_ID = "c0000000-0000-4000-8000-000000000001";

const { insertMock, updateMock, deleteMock, revalidatePathMock } = vi.hoisted(
  () => ({
    insertMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }),
);

/** `.eq().eq().select()` after `update`/`delete`: records the filters and
 * resolves to the configured result. */
function filterChain(
  eqCalls: unknown[][],
  selectCalls: unknown[][],
  result: Promise<unknown>,
) {
  const chain = {
    eq: (...args: unknown[]) => {
      eqCalls.push(args);
      return chain;
    },
    select: (...args: unknown[]) => {
      selectCalls.push(args);
      return result;
    },
  };
  return chain;
}

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
    }),
  }),
}));

import {
  createClientCompany,
  deleteClientCompany,
  renameClientCompany,
} from "./actions";

function formData(name: string): FormData {
  const data = new FormData();
  data.set("name", name);
  return data;
}

beforeEach(() => {
  insertMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
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

describe("renameClientCompany", () => {
  /** Makes `update()` resolve to `result` and returns what the action sent. */
  function stubUpdate(result: { data?: unknown; error: unknown }) {
    const sent = {
      values: undefined as unknown,
      eq: [] as unknown[][],
      select: [] as unknown[][],
    };
    updateMock.mockImplementation((values: unknown) => {
      sent.values = values;
      return filterChain(sent.eq, sent.select, Promise.resolve(result));
    });
    return sent;
  }

  function rename(name: string) {
    return renameClientCompany(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      CLIENT_ID,
      formData(name),
    );
  }

  it("renames the client and revalidates only this workspace's layout", async () => {
    stubUpdate({ data: [{ id: CLIENT_ID }], error: null });

    const result = await rename("Renamed Co.");

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}`,
      "layout",
    );
  });

  it("rejects a workspace slug with a slash without calling the database", async () => {
    const result = await renameClientCompany(
      WORKSPACE_ID,
      "acme-agency/clients",
      CLIENT_ID,
      formData("Renamed Co."),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not rename this client",
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("trims the name", async () => {
    const sent = stubUpdate({ data: [{ id: CLIENT_ID }], error: null });

    await rename("   Renamed Co.  ");

    expect(sent.values).toEqual({ name: "Renamed Co." });
  });

  it("rejects an empty name without calling the database", async () => {
    const result = await rename("   ");

    expect(result).toEqual({ ok: false, error: "Client name is required" });
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects a name over 100 characters without calling the database", async () => {
    const result = await rename("a".repeat(101));

    expect(result).toEqual({
      ok: false,
      error: "Keep it under 100 characters",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("scopes the update to the workspace and the client id and asks for the row back", async () => {
    const sent = stubUpdate({ data: [{ id: CLIENT_ID }], error: null });

    await rename("Renamed Co.");

    expect(sent.eq).toEqual(
      expect.arrayContaining([
        ["id", CLIENT_ID],
        ["workspace_id", WORKSPACE_ID],
      ]),
    );
    expect(sent.select).toEqual([["id"]]);
  });

  it("reports a failure when no row was updated", async () => {
    stubUpdate({ data: [], error: null });

    const result = await rename("Renamed Co.");

    expect(result).toEqual({
      ok: false,
      error: "Could not rename this client",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for a database failure", async () => {
    stubUpdate({ data: null, error: { code: "XX000", message: "boom" } });

    const result = await rename("Renamed Co.");

    expect(result).toEqual({
      ok: false,
      error: "Could not rename this client",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deleteClientCompany", () => {
  function stubDelete(result: { data?: unknown; error: unknown }) {
    const sent = { eq: [] as unknown[][], select: [] as unknown[][] };
    deleteMock.mockImplementation(() =>
      filterChain(sent.eq, sent.select, Promise.resolve(result)),
    );
    return sent;
  }

  function remove() {
    return deleteClientCompany(WORKSPACE_ID, WORKSPACE_SLUG, CLIENT_ID);
  }

  it("deletes the client and revalidates only this workspace's layout", async () => {
    stubDelete({ data: [{ id: CLIENT_ID }], error: null });

    const result = await remove();

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}`,
      "layout",
    );
  });

  it("rejects a workspace slug with a slash without calling the database", async () => {
    const result = await deleteClientCompany(
      WORKSPACE_ID,
      "acme-agency/clients",
      CLIENT_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not delete this client",
    });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("scopes the delete to the workspace and the client id and asks for the row back", async () => {
    const sent = stubDelete({ data: [{ id: CLIENT_ID }], error: null });

    await remove();

    expect(sent.eq).toEqual(
      expect.arrayContaining([
        ["id", CLIENT_ID],
        ["workspace_id", WORKSPACE_ID],
      ]),
    );
    expect(sent.select).toEqual([["id"]]);
  });

  it("maps a foreign key violation to the projects-or-people message", async () => {
    stubDelete({ data: null, error: { code: "23503", message: "fk" } });

    const result = await remove();

    expect(result).toEqual({
      ok: false,
      error:
        "This client now has projects or people, so it can't be deleted. Reload the page to see what changed.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a failure when no row was deleted", async () => {
    stubDelete({ data: [], error: null });

    const result = await remove();

    expect(result).toEqual({
      ok: false,
      error: "Could not delete this client",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a generic error for any other database failure", async () => {
    stubDelete({ data: null, error: { code: "XX000", message: "boom" } });

    const result = await remove();

    expect(result).toEqual({
      ok: false,
      error: "Could not delete this client",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
