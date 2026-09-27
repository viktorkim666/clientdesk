import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftGenerationError } from "@/lib/ai/draft-generator";
import type { DraftGenerator, DraftPrompt } from "@/lib/ai/draft-generator";
import type { ProjectActivity } from "@/lib/ai/activity";

const { createClientMock, getDraftGeneratorMock, loadProjectActivityMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    getDraftGeneratorMock: vi.fn(),
    loadProjectActivityMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/ai", () => ({
  getDraftGenerator: getDraftGeneratorMock,
}));

vi.mock("@/lib/ai/activity", () => ({
  loadProjectActivity: loadProjectActivityMock,
  // The route only passes this straight through to `loadProjectActivity`
  // (itself mocked above), so the identity function is enough here.
  toActivitySupabaseClient: (client: unknown) => client,
}));

import { POST } from "./route";

const PROJECT_ID = "d0000000-0000-4000-8000-00000000000a";
const URL = `http://localhost:3000/api/projects/${PROJECT_ID}/draft-update`;

const SIGNED_IN_CLAIMS = { claims: { sub: "user-1" } };

const NON_EMPTY_ACTIVITY: ProjectActivity = {
  projectName: "Website Redesign",
  clientName: "Acme Inc",
  status: "active",
  items: [
    {
      kind: "update",
      authorName: "Jane Doe",
      createdAt: "2026-09-25T00:00:00.000Z",
      text: "Shipped v1",
    },
  ],
};

const EMPTY_ACTIVITY: ProjectActivity = {
  projectName: "Website Redesign",
  clientName: "Acme Inc",
  status: "active",
  items: [],
};

/** A fake `SupabaseClient` covering only what the route calls: reading the
 * caller's claims and running `claim_ai_draft`. */
function buildFakeSupabase(options: {
  claims?: typeof SIGNED_IN_CLAIMS | null;
  rpcError?: { code?: string; message: string } | null;
}) {
  const claims =
    options.claims === undefined ? SIGNED_IN_CLAIMS : options.claims;
  const rpcError = options.rpcError ?? null;

  return {
    auth: {
      getClaims: vi.fn(() => Promise.resolve({ data: claims, error: null })),
    },
    rpc: vi.fn(() =>
      Promise.resolve({
        data: rpcError ? null : "request-id",
        error: rpcError,
      }),
    ),
  };
}

/** A fake `DraftGenerator` that yields `chunks` one microtask apart, and
 * records the `AbortSignal` it was called with so tests can assert the
 * route forwards `request.signal` unchanged. */
function buildFakeGenerator(
  chunks: string[],
  options: { onCall?: (prompt: DraftPrompt, signal: AbortSignal) => void } = {},
): DraftGenerator {
  return {
    async *generate(prompt: DraftPrompt, signal: AbortSignal) {
      options.onCall?.(prompt, signal);
      for (const chunk of chunks) {
        await Promise.resolve();
        yield chunk;
      }
    },
  };
}

/** A fake `DraftGenerator` that yields `chunks` one microtask apart and then
 * throws `error` - or throws immediately, before its first `yield`, when
 * `chunks` is empty. Mirrors the shape a real failure takes at each point:
 * the SDK can reject on the very first call (no credit balance) or partway
 * through a response.
 *
 * `errorGate`, when given, is awaited right before the throw. Without it,
 * whether a reader sees an already-enqueued chunk before an immediate
 * `controller.error()` clears the stream's queue is a microtask race, not
 * a guarantee - the gate lets a test read a chunk first, then release the
 * error deterministically instead of hoping to win that race. */
function buildFailingGenerator(
  chunks: string[],
  error: unknown,
  options: {
    onCall?: (prompt: DraftPrompt, signal: AbortSignal) => void;
    errorGate?: Promise<void>;
  } = {},
): DraftGenerator {
  return {
    async *generate(prompt: DraftPrompt, signal: AbortSignal) {
      options.onCall?.(prompt, signal);
      for (const chunk of chunks) {
        await Promise.resolve();
        yield chunk;
      }
      await options.errorGate;
      throw error;
    },
  };
}

function buildRequest(url = URL): Request {
  return new Request(url, { method: "POST" });
}

function context(projectId = PROJECT_ID) {
  return { params: Promise.resolve({ projectId }) };
}

async function readAll(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

beforeEach(() => {
  createClientMock.mockReset();
  getDraftGeneratorMock.mockReset();
  loadProjectActivityMock.mockReset();

  createClientMock.mockResolvedValue(buildFakeSupabase({}));
  getDraftGeneratorMock.mockReturnValue(
    buildFakeGenerator(["Hello", " world"]),
  );
  loadProjectActivityMock.mockResolvedValue(NON_EMPTY_ACTIVITY);
});

describe("POST /api/projects/[projectId]/draft-update", () => {
  it("returns 401 when the caller has no session", async () => {
    const supabase = buildFakeSupabase({ claims: null });
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the projectId path segment is not a UUID", async () => {
    const supabase = buildFakeSupabase({});
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(
      buildRequest(
        "http://localhost:3000/api/projects/not-a-uuid/draft-update",
      ),
      context("not-a-uuid"),
    );

    expect(response.status).toBe(404);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 402 when claim_ai_draft raises CD002 (Free plan)", async () => {
    const supabase = buildFakeSupabase({
      rpcError: { code: "CD002", message: "ai_plan_required" },
    });
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Pro");
  });

  it("returns 429 when claim_ai_draft raises CD003 (rate limited)", async () => {
    const supabase = buildFakeSupabase({
      rpcError: { code: "CD003", message: "ai_rate_limited" },
    });
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(429);
  });

  it("returns 404 when claim_ai_draft refuses a non-staff or unknown project", async () => {
    const supabase = buildFakeSupabase({
      rpcError: { message: "only staff can request an AI draft" },
    });
    createClientMock.mockResolvedValue(supabase);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(404);
    consoleErrorSpy.mockRestore();
  });

  it("logs claim_ai_draft's error before returning 404 for a code other than CD002/CD003", async () => {
    const rpcError = { code: "42501", message: "permission denied" };
    const supabase = buildFakeSupabase({ rpcError });
    createClientMock.mockResolvedValue(supabase);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(404);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "draft-update route: claim_ai_draft failed",
      rpcError,
    );
    consoleErrorSpy.mockRestore();
  });

  it("returns 503 and never calls claim_ai_draft when no draft generator is configured", async () => {
    getDraftGeneratorMock.mockReturnValue(null);
    const supabase = buildFakeSupabase({});
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(503);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 422 when there is no activity in the last 7 days, without calling the generator", async () => {
    loadProjectActivityMock.mockResolvedValue(EMPTY_ACTIVITY);
    const generateSpy = vi.fn();
    getDraftGeneratorMock.mockReturnValue(
      buildFakeGenerator([], { onCall: generateSpy }),
    );

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Nothing happened on this project in the last 7 days.",
    });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("returns 500 with a generic message when loading activity fails", async () => {
    loadProjectActivityMock.mockRejectedValue(new Error("db is down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).not.toContain("db is down");
    consoleErrorSpy.mockRestore();
  });

  it("streams the generator's chunks concatenated, with the right headers", async () => {
    getDraftGeneratorMock.mockReturnValue(
      buildFakeGenerator(["Hello", " ", "world"]),
    );

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await readAll(response)).toBe("Hello world");
  });

  it("returns 502 JSON with a generic message when generation fails before the first chunk", async () => {
    const cause = new DraftGenerationError("no credit balance", {
      cause: new Error(
        "400 invalid_request_error: Your credit balance is too low",
      ),
    });
    let receivedSignal: AbortSignal | undefined;
    getDraftGeneratorMock.mockReturnValue(
      buildFailingGenerator([], cause, {
        onCall: (_prompt, signal) => {
          receivedSignal = signal;
        },
      }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The AI service is unavailable right now. Try again later.",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "draft-update route: draft generation failed before the first chunk",
      cause,
    );
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    consoleErrorSpy.mockRestore();
  });

  it("ends the stream in an error state when generation fails after the first chunk", async () => {
    const cause = new DraftGenerationError("stream broke mid-response");
    let releaseError: () => void;
    const errorGate = new Promise<void>((resolve) => {
      releaseError = resolve;
    });
    getDraftGeneratorMock.mockReturnValue(
      buildFailingGenerator(["Hello"], cause, { errorGate }),
    );
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    const first = await reader!.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toBe("Hello");

    releaseError!();
    await expect(reader!.read()).rejects.toBe(cause);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "draft-update route: draft generation failed mid-stream",
      cause,
    );
    consoleErrorSpy.mockRestore();
  });

  it("returns an empty 200 stream when the generator finishes with no chunks", async () => {
    getDraftGeneratorMock.mockReturnValue(buildFakeGenerator([]));

    const response = await POST(buildRequest(), context());

    expect(response.status).toBe(200);
    expect(await readAll(response)).toBe("");
  });

  it("passes request.signal to the generator", async () => {
    const abortController = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    getDraftGeneratorMock.mockReturnValue(
      buildFakeGenerator(["chunk"], {
        onCall: (_prompt, signal) => {
          receivedSignal = signal;
        },
      }),
    );

    const request = new Request(URL, {
      method: "POST",
      signal: abortController.signal,
    });
    const response = await POST(request, context());
    await readAll(response);

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
    abortController.abort();
    expect(receivedSignal?.aborted).toBe(true);
  });
});
