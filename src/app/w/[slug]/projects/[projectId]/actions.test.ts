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
  redirectMock,
  sendProjectUpdateEmailMock,
  isDemoWorkspaceMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  sendProjectUpdateEmailMock: vi.fn<EmailSender["sendProjectUpdateEmail"]>(),
  isDemoWorkspaceMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/lib/demo/is-demo-workspace", () => ({
  isDemoWorkspace: isDemoWorkspaceMock,
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

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
  deleteProject,
  getDownloadUrl,
  postComment,
  postUpdate,
  registerFile,
} from "./actions";

type QueryResult = { data?: unknown; error?: unknown };
type RecordCall = (method: string, args: unknown[]) => void;

interface Chain {
  select: (...args: unknown[]) => Chain;
  eq: (...args: unknown[]) => Chain;
  in: (...args: unknown[]) => Chain;
  order: (...args: unknown[]) => Chain;
  limit: (...args: unknown[]) => Chain;
  insert: (...args: unknown[]) => Chain;
  update: (...args: unknown[]) => Chain;
  delete: (...args: unknown[]) => Chain;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/** A minimal Postgrest-style chainable query builder: every chain method
 * returns itself, and the object is awaitable directly (for `update`/
 * `delete` calls that never reach `.single()`) as well as through
 * `.single()`/`.maybeSingle()`. `record` sees every chain method call. */
function chainResult(result: QueryResult, record?: RecordCall): Chain {
  const chained =
    (method: string) =>
    (...args: unknown[]) => {
      record?.(method, args);
      return builder;
    };
  const builder: Chain = {
    select: chained("select"),
    eq: chained("eq"),
    in: chained("in"),
    order: chained("order"),
    limit: chained("limit"),
    insert: chained("insert"),
    update: chained("update"),
    delete: chained("delete"),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

/** Dispatches `.from(table)` to a per-table chain result, for actions (like
 * `postUpdate`) that query more than one table. A table that is queried more
 * than once takes a list: each query uses the next result, and the last one
 * repeats. `record` sees every chain method call with its table and the
 * 0-based number of the query on that table, so a test can tell the calls of
 * one query from another's. */
function fromByTable(
  results: Record<string, QueryResult | QueryResult[]>,
  record?: (
    table: string,
    method: string,
    args: unknown[],
    query: number,
  ) => void,
) {
  const queues = new Map<string, QueryResult[]>();
  const queryCounts = new Map<string, number>();
  return (table: string) => {
    const configured = results[table];
    if (!configured) {
      throw new Error(`from() was not stubbed for table "${table}"`);
    }
    if (!queues.has(table)) {
      queues.set(
        table,
        Array.isArray(configured) ? [...configured] : [configured],
      );
    }
    const queue = queues.get(table) ?? [];
    const result = queue.length > 1 ? queue.shift() : queue[0];
    const query = queryCounts.get(table) ?? 0;
    queryCounts.set(table, query + 1);
    return chainResult(result ?? {}, (method, args) =>
      record?.(table, method, args, query),
    );
  };
}

function buildClient(options: {
  claims?: { claims: { sub: string } } | null;
  from?: (table: string) => Chain;
  rpc?: () => Promise<{ data: unknown; error: unknown }>;
  storage?: {
    list?: (
      path?: string,
      options?: { limit?: number; offset?: number },
    ) => Promise<{ data: unknown; error: unknown }>;
    remove?: (paths: string[]) => Promise<{ data?: unknown; error: unknown }>;
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
  redirectMock.mockClear();
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

describe("registerFile in a demo sandbox", () => {
  const storagePath = buildStoragePath({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    fileId: FILE_ID,
    name: VALID_METADATA.name,
  });

  it.each([
    ["demo_upload_count_limit", /5 uploads/],
    ["demo_upload_size_limit", /over 2 MB/],
    ["demo_upload_type_limit", /must be an image/],
  ])(
    "turns the database's CD005 %s into its own message",
    async (message, pattern) => {
      createClientMock.mockReturnValue(
        buildClient({
          from: () => chainResult({ error: { code: "CD005", message } }),
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

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(pattern);
      }
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("keeps the generic message for any other insert error", async () => {
    createClientMock.mockReturnValue(
      buildClient({
        from: () =>
          chainResult({ error: { code: "23505", message: "duplicate" } }),
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

    expect(result).toEqual({ ok: false, error: "Could not save the file" });
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

describe("deleteProject", () => {
  const PROJECT_FOLDER = `${WORKSPACE_ID}/${PROJECT_ID}`;
  const OTHER_FILE_ID = "90000000-0000-4000-8000-00000000000b";
  const PROJECTS_LIST_PATH = `/w/${WORKSPACE_SLUG}/projects`;
  const NOTHING_REMOVED = "Could not delete the project. Nothing was removed.";
  const PARTLY_REMOVED =
    "Some files were deleted, but the project was not. Try again.";

  function objectPath(fileId: string, name: string): string {
    return `${PROJECT_FOLDER}/${fileId}/${name}`;
  }

  /** Storage's `list` over a fixed tree: a folder entry has `id: null`, and
   * the `limit`/`offset` options page the way Storage does (100 by default). */
  function listOver(
    tree: Record<string, { name: string; id: string | null }[]>,
  ) {
    return vi.fn(
      (path?: string, options?: { limit?: number; offset?: number }) => {
        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? 100;
        return Promise.resolve({
          data: (tree[path ?? ""] ?? []).slice(offset, offset + limit),
          error: null,
        });
      },
    );
  }

  const folderEntry = (name: string) => ({ name, id: null });
  const objectEntry = (name: string) => ({ name, id: `object-${name}` });

  /** A listing that shows exactly these object paths, each under the
   * file-id folder the app's own upload paths use. */
  function listingOf(paths: string[]) {
    const tree: Record<string, { name: string; id: string | null }[]> = {};
    for (const path of paths) {
      const [folder, name] = [
        path.slice(0, path.lastIndexOf("/")),
        path.slice(path.lastIndexOf("/") + 1),
      ];
      tree[folder] = [...(tree[folder] ?? []), objectEntry(name)];
      const parent = folder.slice(0, folder.lastIndexOf("/"));
      const parentName = folder.slice(folder.lastIndexOf("/") + 1);
      tree[parent] = tree[parent] ?? [];
      if (!tree[parent].some((entry) => entry.name === parentName)) {
        tree[parent].push(folderEntry(parentName));
      }
    }
    return listOver(tree);
  }

  /** A staff caller deleting a project that exists. `events` lists, in
   * order, the database calls and Storage removals the action made. */
  function staffClient(
    options: {
      role?: string | null;
      claims?: { claims: { sub: string } } | null;
      projectLookup?: QueryResult;
      projectDelete?: QueryResult;
      fileRows?: QueryResult;
      list?: (
        path?: string,
        options?: { limit?: number; offset?: number },
      ) => Promise<{ data: unknown; error: unknown }>;
      remove?: (paths: string[]) => Promise<{ data?: unknown; error: unknown }>;
    } = {},
  ) {
    const events: string[] = [];
    const filesCalls: { method: string; args: unknown[] }[] = [];
    const calls: {
      table: string;
      query: number;
      method: string;
      args: unknown[];
    }[] = [];
    const remove = vi.fn(
      options.remove ??
        ((paths: string[]) =>
          Promise.resolve({
            data: paths.map((name) => ({ name })),
            error: null,
          })),
    );
    const list = vi.fn(options.list ?? listOver({}));
    const client = buildClient({
      claims: options.claims,
      from: fromByTable(
        {
          workspace_members: {
            data:
              options.role === null ? null : { role: options.role ?? "member" },
            error: null,
          },
          projects: [
            options.projectLookup ?? {
              data: { id: PROJECT_ID, workspace_id: WORKSPACE_ID },
              error: null,
            },
            options.projectDelete ?? {
              data: [{ id: PROJECT_ID }],
              error: null,
            },
          ],
          project_files: options.fileRows ?? { error: null },
        },
        (table, method, args, query) => {
          calls.push({ table, query, method, args });
          if (method === "delete") {
            events.push(`${table}.delete`);
          }
          if (table === "project_files") {
            filesCalls.push({ method, args });
          }
        },
      ),
      storage: {
        list,
        remove: (paths) => {
          events.push("storage.remove");
          return remove(paths);
        },
      },
    });
    return { client, events, filesCalls, calls, list, remove };
  }

  async function runDeleteProject() {
    return deleteProject(WORKSPACE_ID, WORKSPACE_SLUG, PROJECT_ID);
  }

  it.each([
    ["workspace id", "not-a-uuid", PROJECT_ID],
    ["project id", WORKSPACE_ID, "../" + OTHER_PROJECT_ID],
  ])(
    "rejects a %s that is not a UUID before any query",
    async (_label, workspaceId, projectId) => {
      const result = await deleteProject(
        workspaceId,
        WORKSPACE_SLUG,
        projectId,
      );

      expect(result).toEqual({ ok: false, error: "Project not found" });
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a signed-out caller without touching Storage or the database", async () => {
    const { client, list, remove, events } = staffClient({ claims: null });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: "You must be signed in" });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("refuses a client without touching Storage", async () => {
    const { client, list, remove, events } = staffClient({ role: "client" });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not a member of the workspace", async () => {
    const { client, list, remove } = staffClient({ role: null });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(["../x", "Acme", "acme agency", ""])(
    "rejects a workspace slug %j before any query",
    async (slug) => {
      const result = await deleteProject(WORKSPACE_ID, slug, PROJECT_ID);

      expect(result).toEqual({ ok: false, error: "Project not found" });
      expect(createClientMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a workspace slug with a slash", async () => {
    const result = await deleteProject(
      WORKSPACE_ID,
      "acme-agency/projects",
      PROJECT_ID,
    );

    expect(result).toEqual({ ok: false, error: "Project not found" });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns an error when the project is not found", async () => {
    const { client, list, remove } = staffClient({
      projectLookup: { data: null, error: null },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: "Project not found" });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes every object under the project folder, including ones with no file row, before deleting the project", async () => {
    const registered = objectPath(FILE_ID, "notes.pdf");
    const unregistered = objectPath(OTHER_FILE_ID, "stray.png");
    const { client, events, list, remove } = staffClient({
      list: listOver({
        [PROJECT_FOLDER]: [folderEntry(FILE_ID), folderEntry(OTHER_FILE_ID)],
        [`${PROJECT_FOLDER}/${FILE_ID}`]: [objectEntry("notes.pdf")],
        [`${PROJECT_FOLDER}/${OTHER_FILE_ID}`]: [objectEntry("stray.png")],
      }),
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow(
      `NEXT_REDIRECT:${PROJECTS_LIST_PATH}`,
    );

    expect(list).toHaveBeenCalledWith(
      PROJECT_FOLDER,
      expect.objectContaining({ offset: 0 }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0].toSorted()).toEqual(
      [registered, unregistered].toSorted(),
    );
    expect(events.indexOf("storage.remove")).toBeGreaterThan(-1);
    expect(events.indexOf("storage.remove")).toBeLessThan(
      events.indexOf("projects.delete"),
    );
  });

  it("does not read project_files to decide what to remove", async () => {
    const { client, calls, events } = staffClient();
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow(
      `NEXT_REDIRECT:${PROJECTS_LIST_PATH}`,
    );

    expect(calls.filter((call) => call.table === "project_files")).toEqual([]);
    expect(events).toEqual(["projects.delete"]);
  });

  it("pages through a long folder and removes in batches", async () => {
    const entries = Array.from({ length: 250 }, (_, index) =>
      objectEntry(`file-${index}.png`),
    );
    const { client, list, remove } = staffClient({
      list: listOver({ [PROJECT_FOLDER]: entries }),
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow("NEXT_REDIRECT");

    expect(list).toHaveBeenCalledTimes(3);
    const removed = remove.mock.calls.flatMap(([paths]) => paths);
    expect(removed).toHaveLength(250);
    expect(new Set(removed).size).toBe(250);
    expect(remove.mock.calls.every(([paths]) => paths.length <= 100)).toBe(
      true,
    );
  });

  it("deletes a project with no files without calling remove", async () => {
    const { client, events, remove } = staffClient();
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow(
      `NEXT_REDIRECT:${PROJECTS_LIST_PATH}`,
    );

    expect(remove).not.toHaveBeenCalled();
    expect(events).toEqual(["projects.delete"]);
  });

  it("scopes the membership lookup to the workspace and the signed-in user", async () => {
    const { client, calls } = staffClient();
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow("NEXT_REDIRECT");

    const membership = calls.filter(
      (call) => call.table === "workspace_members",
    );
    expect(membership.filter((call) => call.method === "eq")).toEqual([
      expect.objectContaining({ args: ["workspace_id", WORKSPACE_ID] }),
      expect.objectContaining({ args: ["user_id", USER_ID] }),
    ]);
  });

  it("scopes the project lookup and the row delete to the workspace and project, each on its own", async () => {
    const { client, calls } = staffClient();
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow("NEXT_REDIRECT");

    const scopeOf = (query: number) =>
      calls
        .filter(
          (call) =>
            call.table === "projects" &&
            call.query === query &&
            call.method === "eq",
        )
        .map((call) => call.args);
    const expectedScope = [
      ["id", PROJECT_ID],
      ["workspace_id", WORKSPACE_ID],
    ];
    expect(scopeOf(0)).toEqual(expectedScope);
    expect(scopeOf(1)).toEqual(expectedScope);
    expect(
      calls.some(
        (call) =>
          call.table === "projects" &&
          call.query === 1 &&
          call.method === "delete",
      ),
    ).toBe(true);
  });

  it("asks Storage for pages of the page-size limit", async () => {
    const { client, list } = staffClient();
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow("NEXT_REDIRECT");

    expect(list).toHaveBeenCalledWith(PROJECT_FOLDER, {
      limit: 100,
      offset: 0,
    });
  });

  it("builds the Storage prefix from the stored ids, not from the caller's casing", async () => {
    const stored = objectPath(FILE_ID, "notes.pdf");
    const { client, list, remove } = staffClient({
      list: listingOf([stored]),
      projectLookup: {
        data: { id: PROJECT_ID, workspace_id: WORKSPACE_ID },
        error: null,
      },
    });
    createClientMock.mockReturnValue(client);

    await expect(
      deleteProject(
        WORKSPACE_ID.toUpperCase(),
        WORKSPACE_SLUG,
        PROJECT_ID.toUpperCase(),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(list.mock.calls.map(([prefix]) => prefix)).toEqual([
      PROJECT_FOLDER,
      `${PROJECT_FOLDER}/${FILE_ID}`,
    ]);
    expect(remove).toHaveBeenCalledWith([stored]);
  });

  it("returns an error when the membership lookup fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const base = staffClient();
    const { client, list, remove } = base;
    createClientMock.mockReturnValue({
      ...client,
      from: fromByTable({
        workspace_members: { data: null, error: { message: "db down" } },
      }),
    });

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "deleteProject action: role lookup failed",
      { message: "db down" },
    );

    consoleErrorSpy.mockRestore();
  });

  it("returns an error when the project lookup fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, list, remove } = staffClient({
      projectLookup: { data: null, error: { message: "db down" } },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "deleteProject action: project lookup failed",
      { message: "db down" },
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the project when listing the folder fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, events, remove } = staffClient({
      list: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: "list failed" } }),
      ),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(remove).not.toHaveBeenCalled();
    expect(events).not.toContain("projects.delete");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the project when listing a nested folder fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, events, remove } = staffClient({
      list: vi.fn((path?: string) =>
        Promise.resolve(
          path === PROJECT_FOLDER
            ? { data: [folderEntry(FILE_ID)], error: null }
            : { data: null, error: { message: "nested list failed" } },
        ),
      ),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(remove).not.toHaveBeenCalled();
    expect(events).not.toContain("projects.delete");
    expect(redirectMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the project when listing fails on a later page", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      objectEntry(`file-${index}.png`),
    );
    const { client, events, list, remove } = staffClient({
      list: vi.fn((_path?: string, options?: { offset?: number }) =>
        Promise.resolve(
          options?.offset === 0
            ? { data: firstPage, error: null }
            : { data: null, error: { message: "page two failed" } },
        ),
      ),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(events).not.toContain("projects.delete");

    consoleErrorSpy.mockRestore();
  });

  it("stops at an empty page after a page that was exactly the limit", async () => {
    const entries = Array.from({ length: 100 }, (_, index) =>
      objectEntry(`file-${index}.png`),
    );
    const { client, list, remove } = staffClient({
      list: listOver({ [PROJECT_FOLDER]: entries }),
    });
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow("NEXT_REDIRECT");

    expect(list.mock.calls.map(([, options]) => options?.offset)).toEqual([
      0, 100,
    ]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toHaveLength(100);
  });

  it("does not delete the project when Storage removes nothing and reports an error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, events } = staffClient({
      list: listingOf([objectPath(FILE_ID, "notes.pdf")]),
      remove: () =>
        Promise.resolve({ data: null, error: { message: "storage down" } }),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(events).not.toContain("projects.delete");
    expect(events).not.toContain("project_files.delete");
    expect(redirectMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the project when Storage removes fewer objects than asked, and drops the rows of the ones it did remove", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const first = objectPath(FILE_ID, "a.pdf");
    const second = objectPath(OTHER_FILE_ID, "b.pdf");
    const { client, events, filesCalls } = staffClient({
      list: listingOf([first, second]),
      remove: () => Promise.resolve({ data: [{ name: first }], error: null }),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: PARTLY_REMOVED });
    expect(events).not.toContain("projects.delete");
    expect(filesCalls).toContainEqual({
      method: "in",
      args: ["storage_path", [first]],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the project when Storage removes none of a batch without an error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, events } = staffClient({
      list: listingOf([objectPath(FILE_ID, "a.pdf")]),
      remove: () => Promise.resolve({ data: [], error: null }),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(events).not.toContain("projects.delete");

    consoleErrorSpy.mockRestore();
  });

  it("treats a response that names other paths as a failure", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client, events, filesCalls } = staffClient({
      list: listingOf([objectPath(FILE_ID, "a.pdf")]),
      remove: () =>
        Promise.resolve({
          data: [{ name: objectPath(OTHER_FILE_ID, "someone-elses.pdf") }],
          error: null,
        }),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(events).not.toContain("projects.delete");
    expect(filesCalls).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "deleteProject action: storage remove failed",
      { error: null, batchSize: 1, removed: 0 },
    );

    consoleErrorSpy.mockRestore();
  });

  it("reports that nothing was removed when the first of several batches fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const paths = Array.from({ length: 150 }, (_, index) =>
      objectPath(FILE_ID, `file-${index}.png`),
    );
    const { client, events, filesCalls, remove } = staffClient({
      list: listingOf(paths),
      remove: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(events).not.toContain("projects.delete");
    expect(filesCalls).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("still reports the partial failure, and logs, when dropping the file rows fails too", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const first = objectPath(FILE_ID, "a.pdf");
    const second = objectPath(OTHER_FILE_ID, "b.pdf");
    const { client } = staffClient({
      list: listingOf([first, second]),
      remove: () => Promise.resolve({ data: [{ name: first }], error: null }),
      fileRows: { error: { message: "rows locked" } },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: PARTLY_REMOVED });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "deleteProject action: file rows cleanup failed",
      { message: "rows locked" },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );

    consoleErrorSpy.mockRestore();
  });

  it("drops the file rows of objects already removed when a later batch fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const paths = Array.from({ length: 150 }, (_, index) =>
      objectPath(FILE_ID, `file-${index}.png`),
    );
    let call = 0;
    const { client, events, filesCalls } = staffClient({
      list: listingOf(paths),
      remove: (batch) => {
        call += 1;
        return call === 1
          ? Promise.resolve({
              data: batch.map((name) => ({ name })),
              error: null,
            })
          : Promise.resolve({ data: null, error: { message: "boom" } });
      },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: PARTLY_REMOVED });
    expect(events).not.toContain("projects.delete");
    const droppedPaths = filesCalls
      .filter((fileCall) => fileCall.method === "in")
      .flatMap((fileCall) => fileCall.args[1] as string[]);
    expect(droppedPaths).toHaveLength(100);
    expect(new Set(droppedPaths).size).toBe(100);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/projects/${PROJECT_ID}`,
    );
    expect(redirectMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("reports a failure when the delete affects no row, and says files are already gone", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const stored = objectPath(FILE_ID, "notes.pdf");
    const { client, filesCalls } = staffClient({
      list: listingOf([stored]),
      projectDelete: { data: [], error: null },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: PARTLY_REMOVED });
    expect(filesCalls).toContainEqual({
      method: "in",
      args: ["storage_path", [stored]],
    });
    expect(redirectMock).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("reports that nothing was removed when the delete affects no row and there were no files", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client } = staffClient({
      projectDelete: { data: [], error: null },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(revalidatePathMock).not.toHaveBeenCalledWith(PROJECTS_LIST_PATH);

    consoleErrorSpy.mockRestore();
  });

  it("reports a failure when the delete returns an error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client } = staffClient({
      projectDelete: { data: null, error: { message: "denied" } },
    });
    createClientMock.mockReturnValue(client);

    const result = await runDeleteProject();

    expect(result).toEqual({ ok: false, error: NOTHING_REMOVED });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("revalidates the projects list, the dashboard and the clients page, then redirects to the projects list", async () => {
    const { client } = staffClient({ role: "owner" });
    createClientMock.mockReturnValue(client);

    await expect(runDeleteProject()).rejects.toThrow(
      `NEXT_REDIRECT:${PROJECTS_LIST_PATH}`,
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(PROJECTS_LIST_PATH);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/w/${WORKSPACE_SLUG}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/w/${WORKSPACE_SLUG}/clients`,
    );
    expect(redirectMock).toHaveBeenCalledWith(PROJECTS_LIST_PATH);
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
    const builder: Chain = {
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
