import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSender } from "@/lib/email/types";
import { buildStoragePath } from "@/lib/files/storage-path";

// zod's z.uuid() checks the version nibble, unlike the fixed, human-readable
// ids in supabase/seed.sql, so these tests use ids it accepts.
const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";
const WORKSPACE_NAME = "Acme Agency";
const PROJECT_ID = "d0000000-0000-4000-8000-00000000000a";
const OTHER_PROJECT_ID = "d0000000-0000-4000-8000-00000000000b";
const PROJECT_NAME = "Client A Website Redesign";
const USER_ID = "00000001-0000-4000-8000-000000000001";
const FILE_ID = "90000000-0000-4000-8000-00000000000a";
const UPDATE_ID = "e0000000-0000-4000-8000-00000000000a";
const COMMENT_ID = "f0000000-0000-4000-8000-00000000000a";

const {
  createClientMock,
  revalidatePathMock,
  sendProjectUpdateEmailMock,
  isDemoWorkspaceMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  sendProjectUpdateEmailMock: vi.fn<EmailSender["sendProjectUpdateEmail"]>(),
  isDemoWorkspaceMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/lib/demo/is-demo-workspace", () => ({
  isDemoWorkspace: isDemoWorkspaceMock,
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/email", () => ({
  getEmailSender: () => ({
    sendInvitationEmail: vi.fn(),
    sendProjectUpdateEmail: sendProjectUpdateEmailMock,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import {
  changeStatus,
  deleteComment,
  deleteFile,
  getDownloadUrl,
  postComment,
  postUpdate,
  registerFile,
} from "./actions";

/** A minimal Postgrest-style chainable query builder: every chain method
 * returns itself, and the object is awaitable directly (for `update`/
 * `delete` calls that never reach `.single()`) as well as through
 * `.single()`/`.maybeSingle()`. */
function chainResult(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

/** Dispatches `.from(table)` to a per-table chain result, for actions (like
 * `postUpdate`) that query more than one table. */
function fromByTable(
  results: Record<string, { data?: unknown; error?: unknown }>,
) {
  return (table: string) => {
    const result = results[table];
    if (!result) {
      throw new Error(`from() was not stubbed for table "${table}"`);
    }
    return chainResult(result);
  };
}

function buildClient(options: {
  claims?: { claims: { sub: string } } | null;
  from?: (table: string) => ReturnType<typeof chainResult>;
  rpc?: () => Promise<{ data: unknown; error: unknown }>;
  storage?: {
    list?: () => Promise<{ data: unknown; error: unknown }>;
    remove?: () => Promise<{ error: unknown }>;
    createSignedUrl?: () => Promise<{ data: unknown; error: unknown }>;
  };
}) {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data:
            options.claims === undefined
              ? { claims: { sub: USER_ID } }
              : options.claims,
        }),
    },
    from:
      options.from ??
      (() => {
        throw new Error("from() was not stubbed for this test");
      }),
    rpc: options.rpc ?? (() => Promise.resolve({ data: [], error: null })),
    storage: {
      from: () => ({
        list:
          options.storage?.list ??
          (() => Promise.resolve({ data: [], error: null })),
        remove:
          options.storage?.remove ?? (() => Promise.resolve({ error: null })),
        createSignedUrl:
          options.storage?.createSignedUrl ??
          (() =>
            Promise.resolve({
              data: { signedUrl: "https://storage.test/signed" },
              error: null,
            })),
      }),
    },
  };
}

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockClear();
  sendProjectUpdateEmailMock.mockReset();
  isDemoWorkspaceMock.mockReset().mockResolvedValue(false);
});

describe("changeStatus", () => {
  it("rejects an invalid status without querying the database", async () => {
    const result = await changeStatus(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      "archived",
    );

    expect(result).toEqual({ ok: false, error: "Invalid status" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("updates the status and revalidates the project page", async () => {
    createClientMock.mockReturnValue(
      buildClient({ from: () => chainResult({ error: null }) }),
    );

    const result = await changeStatus(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      "on_hold",
    );

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });

  it("reports a generic error when the update fails", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ error: { message: "denied" } }),
      }),
    );

    const result = await changeStatus(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      "done",
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not change the project's status",
    });
  });
});

function buildFormData(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("postUpdate", () => {
  it("rejects an empty body without querying the database", async () => {
    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "" }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Update body is required",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("reports a generic error when the insert fails", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: null, error: { message: "denied" } },
        }),
      }),
    );

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({ ok: false, error: "Could not post the update" });
  });

  it("posts the update and warns without failing when recipients cannot be read", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: { id: "update-1" }, error: null },
        }),
        rpc: () =>
          Promise.resolve({ data: null, error: { message: "denied" } }),
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    });
    expect(sendProjectUpdateEmailMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("reports a warning without failing when the workspace or project name cannot be read", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: { id: "update-1" }, error: null },
          workspaces: { data: null, error: { message: "denied" } },
          projects: { data: { name: PROJECT_NAME }, error: null },
        }),
        rpc: () =>
          Promise.resolve({
            data: ["client-a@clientdesk.test"],
            error: null,
          }),
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    });
    expect(sendProjectUpdateEmailMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("posts the update and warns without failing when an email cannot be sent", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: { id: "update-1" }, error: null },
          workspaces: { data: { name: WORKSPACE_NAME }, error: null },
          projects: { data: { name: PROJECT_NAME }, error: null },
        }),
        rpc: () =>
          Promise.resolve({
            data: ["client-a@clientdesk.test"],
            error: null,
          }),
      }),
    );
    sendProjectUpdateEmailMock.mockRejectedValueOnce(
      new Error("Resend is down"),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({
      ok: true,
      warning: "Update posted, but some emails could not be sent.",
    });

    consoleErrorSpy.mockRestore();
  });

  it("sends to every recipient even after one send fails, and counts only the failures", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: { id: "update-1" }, error: null },
          workspaces: { data: { name: WORKSPACE_NAME }, error: null },
          projects: { data: { name: PROJECT_NAME }, error: null },
        }),
        rpc: () =>
          Promise.resolve({
            data: ["client-a@clientdesk.test", "client-b@clientdesk.test"],
            error: null,
          }),
      }),
    );
    sendProjectUpdateEmailMock.mockRejectedValueOnce(
      new Error("Resend is down"),
    );
    sendProjectUpdateEmailMock.mockResolvedValueOnce(undefined);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({
      ok: true,
      warning: "Update posted, but some emails could not be sent.",
    });
    expect(sendProjectUpdateEmailMock).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "postUpdate action: sendProjectUpdateEmail failed",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("posts the update and emails every recipient using names read from the database, building the link from the site url", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: fromByTable({
          project_updates: { data: { id: "update-1" }, error: null },
          workspaces: { data: { name: WORKSPACE_NAME }, error: null },
          projects: { data: { name: PROJECT_NAME }, error: null },
        }),
        rpc: () =>
          Promise.resolve({
            data: ["client-a@clientdesk.test"],
            error: null,
          }),
      }),
    );
    sendProjectUpdateEmailMock.mockResolvedValueOnce(undefined);

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({ ok: true });
    expect(sendProjectUpdateEmailMock).toHaveBeenCalledWith({
      to: "client-a@clientdesk.test",
      workspaceName: WORKSPACE_NAME,
      projectName: PROJECT_NAME,
      body: "Kickoff notes.",
      projectUrl: `http://localhost:3000/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });
});

describe("postUpdate in a demo workspace", () => {
  function demoClient(rpc: () => Promise<{ data: unknown; error: unknown }>) {
    return buildClient({
      from: fromByTable({
        project_updates: { data: { id: "update-1" }, error: null },
        workspaces: { data: { name: WORKSPACE_NAME }, error: null },
        projects: { data: { name: PROJECT_NAME }, error: null },
      }),
      rpc,
    });
  }

  it("posts the update but sends no email, whoever the recipients are", async () => {
    isDemoWorkspaceMock.mockResolvedValue(true);
    const rpc = vi.fn(() =>
      Promise.resolve({ data: ["real-person@example.com"], error: null }),
    );
    createClientMock.mockReturnValue(demoClient(rpc));

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({ ok: true });
    expect(sendProjectUpdateEmailMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });

  it("sends no email when the demo check itself fails, and says so", async () => {
    isDemoWorkspaceMock.mockRejectedValue(new Error("lookup failed"));
    createClientMock.mockReturnValue(
      demoClient(() =>
        Promise.resolve({ data: ["real-person@example.com"], error: null }),
      ),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(result).toEqual({
      ok: true,
      warning: "Update posted, but recipients could not be notified.",
    });
    expect(sendProjectUpdateEmailMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("checks the workspace the update was posted to", async () => {
    createClientMock.mockReturnValue(
      demoClient(() => Promise.resolve({ data: [], error: null })),
    );

    await postUpdate(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ body: "Kickoff notes." }),
    );

    expect(isDemoWorkspaceMock).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
    );
  });
});

describe("postComment", () => {
  it("rejects an empty body without querying the database", async () => {
    const result = await postComment(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({ updateId: UPDATE_ID, body: "" }),
    );

    expect(result).toEqual({ ok: false, error: "Comment body is required" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("posts the comment and revalidates the project page", async () => {
    createClientMock.mockReturnValue(
      buildClient({ from: () => chainResult({ error: null }) }),
    );

    const result = await postComment(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({
        updateId: UPDATE_ID,
        body: "Looks great!",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });

  it("reports a generic error when the insert fails", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ error: { message: "denied" } }),
      }),
    );

    const result = await postComment(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      buildFormData({
        updateId: UPDATE_ID,
        body: "Looks great!",
      }),
    );

    expect(result).toEqual({ ok: false, error: "Could not post the comment" });
  });
});

describe("deleteComment", () => {
  it("deletes the comment and revalidates the project page", async () => {
    createClientMock.mockReturnValue(
      buildClient({ from: () => chainResult({ error: null }) }),
    );

    const result = await deleteComment(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      COMMENT_ID,
    );

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });

  it("reports a generic error when RLS denies the delete", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ error: { message: "denied" } }),
      }),
    );

    const result = await deleteComment(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      COMMENT_ID,
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not delete the comment",
    });
  });
});

const VALID_METADATA = {
  name: "kickoff-notes.pdf",
  size: 204800,
  mimeType: "application/pdf",
};

describe("registerFile", () => {
  it("rejects a disallowed mime type without touching storage or the database", async () => {
    const storagePath = buildStoragePath({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      fileId: FILE_ID,
      name: "malware.exe",
    });

    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      storagePath,
      { name: "malware.exe", size: 1024, mimeType: "application/x-msdownload" },
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects an oversize file without touching storage or the database", async () => {
    const storagePath = buildStoragePath({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      fileId: FILE_ID,
      name: "huge.pdf",
    });

    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      storagePath,
      { name: "huge.pdf", size: 11 * 1024 * 1024, mimeType: "application/pdf" },
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed storage path", async () => {
    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      "not-a-valid-path",
      VALID_METADATA,
    );

    expect(result).toEqual({ ok: false, error: "Invalid file path" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects a path pointing at a different project than the caller named", async () => {
    const storagePath = buildStoragePath({
      workspaceId: WORKSPACE_ID,
      projectId: OTHER_PROJECT_ID,
      fileId: FILE_ID,
      name: VALID_METADATA.name,
    });

    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      storagePath,
      VALID_METADATA,
    );

    expect(result).toEqual({ ok: false, error: "Invalid file path" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects when the uploaded object cannot be found in storage", async () => {
    const storagePath = buildStoragePath({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      fileId: FILE_ID,
      name: VALID_METADATA.name,
    });
    createClientMock.mockReturnValue(
      buildClient({
        storage: { list: () => Promise.resolve({ data: [], error: null }) },
      }),
    );

    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      storagePath,
      VALID_METADATA,
    );

    expect(result).toEqual({
      ok: false,
      error: "Upload not found. Try again.",
    });
  });

  it("registers the file once the object is confirmed to exist", async () => {
    const storagePath = buildStoragePath({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      fileId: FILE_ID,
      name: VALID_METADATA.name,
    });
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ error: null }),
        storage: {
          list: () =>
            Promise.resolve({
              data: [{ name: VALID_METADATA.name }],
              error: null,
            }),
        },
      }),
    );

    const result = await registerFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      storagePath,
      VALID_METADATA,
    );

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });
});

describe("deleteFile", () => {
  const STORAGE_PATH = buildStoragePath({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    fileId: FILE_ID,
    name: "kickoff-notes.pdf",
  });

  it("deletes the row scoped to the caller's project and workspace, and removes the object at the row's own storage_path", async () => {
    const removeMock = vi.fn(() => Promise.resolve({ error: null }));
    createClientMock.mockReturnValue(
      buildClient({
        from: () =>
          chainResult({ data: { storage_path: STORAGE_PATH }, error: null }),
        storage: { remove: removeMock },
      }),
    );

    const result = await deleteFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      FILE_ID,
    );

    expect(result).toEqual({ ok: true });
    expect(removeMock).toHaveBeenCalledWith([STORAGE_PATH]);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
  });

  it("does not touch storage and reports an error when RLS denies the row delete", async () => {
    const removeMock = vi.fn(() => Promise.resolve({ error: null }));
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ data: null, error: { message: "denied" } }),
        storage: { remove: removeMock },
      }),
    );

    const result = await deleteFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      FILE_ID,
    );

    expect(result).toEqual({ ok: false, error: "Could not delete the file" });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("does not touch storage and reports an error when no row matched the id, project and workspace", async () => {
    const removeMock = vi.fn(() => Promise.resolve({ error: null }));
    createClientMock.mockReturnValue(
      buildClient({
        from: () => chainResult({ data: null, error: null }),
        storage: { remove: removeMock },
      }),
    );

    const result = await deleteFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      FILE_ID,
    );

    expect(result).toEqual({ ok: false, error: "Could not delete the file" });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("still reports success when the row is gone but the object removal fails", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () =>
          chainResult({ data: { storage_path: STORAGE_PATH }, error: null }),
        storage: {
          remove: () =>
            Promise.resolve({ error: { message: "object not found" } }),
        },
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await deleteFile(
      WORKSPACE_ID,
      WORKSPACE_SLUG,
      PROJECT_ID,
      FILE_ID,
    );

    expect(result).toEqual({ ok: true });

    consoleErrorSpy.mockRestore();
  });
});

describe("getDownloadUrl", () => {
  it("returns an error when the file row cannot be read", async () => {
    createClientMock.mockReturnValue(
      buildClient({ from: () => chainResult({ data: null, error: null }) }),
    );

    const result = await getDownloadUrl(PROJECT_ID, FILE_ID);

    expect(result).toEqual({ ok: false, error: "File not found" });
  });

  it("scopes the file lookup to the given project id, as defense in depth alongside RLS", async () => {
    const eqMock = vi.fn(() => builder);
    const inner = chainResult({
      data: { storage_path: "some/path.pdf" },
      error: null,
    });
    const builder: ReturnType<typeof chainResult> = {
      select: () => builder,
      eq: eqMock,
      in: inner.in,
      order: inner.order,
      limit: inner.limit,
      insert: inner.insert,
      update: inner.update,
      delete: inner.delete,
      maybeSingle: inner.maybeSingle,
      single: inner.single,
      then: inner.then,
    };
    createClientMock.mockReturnValue(
      buildClient({
        from: () => builder,
      }),
    );

    await getDownloadUrl(PROJECT_ID, FILE_ID);

    expect(eqMock).toHaveBeenCalledWith("id", FILE_ID);
    expect(eqMock).toHaveBeenCalledWith("project_id", PROJECT_ID);
  });

  it("returns an error when Storage cannot sign the url", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () =>
          chainResult({ data: { storage_path: "some/path.pdf" }, error: null }),
        storage: {
          createSignedUrl: () =>
            Promise.resolve({ data: null, error: { message: "not found" } }),
        },
      }),
    );

    const result = await getDownloadUrl(PROJECT_ID, FILE_ID);

    expect(result).toEqual({
      ok: false,
      error: "Could not create a download link",
    });
  });

  it("returns a signed url for a readable file", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () =>
          chainResult({ data: { storage_path: "some/path.pdf" }, error: null }),
        storage: {
          createSignedUrl: () =>
            Promise.resolve({
              data: { signedUrl: "https://storage.test/signed" },
              error: null,
            }),
        },
      }),
    );

    const result = await getDownloadUrl(PROJECT_ID, FILE_ID);

    expect(result).toEqual({
      ok: true,
      data: { url: "https://storage.test/signed" },
    });
  });
});
