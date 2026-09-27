import { describe, expect, it, vi } from "vitest";
import {
  draftOutcomeStatusMessage,
  readDraftError,
  streamDraft,
  type DraftFetch,
  type DraftReader,
} from "./draft-client";

/** A `getReader()`-shaped stub that yields the given chunks, then ends
 * (or throws, if `failure` is set, after the chunks already handed out). */
function fakeReader(chunks: string[], failure?: Error): DraftReader {
  const encoder = new TextEncoder();
  const queue = [...chunks];
  return {
    read: vi.fn(() => {
      const next = queue.shift();
      if (next !== undefined) {
        return Promise.resolve({ done: false, value: encoder.encode(next) });
      }
      return failure
        ? Promise.reject(failure)
        : Promise.resolve({ done: true });
    }),
  };
}

describe("readDraftError", () => {
  it("returns the server's error message", async () => {
    const response = {
      json: () =>
        Promise.resolve({ error: "AI drafts are part of the Pro plan." }),
    };
    await expect(readDraftError(response)).resolves.toBe(
      "AI drafts are part of the Pro plan.",
    );
  });

  it("falls back to a generic message when the body has no error string", async () => {
    const response = { json: () => Promise.resolve({}) };
    await expect(readDraftError(response)).resolves.toBe(
      "Could not draft the update",
    );
  });

  it("falls back to a generic message when the body isn't JSON", async () => {
    const response = {
      json: () =>
        Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    };
    await expect(readDraftError(response)).resolves.toBe(
      "Could not draft the update",
    );
  });

  // Not status-specific - `readDraftError` only ever looks at the body - but
  // named explicitly for the route's pre-first-chunk failure (502), which
  // reaches the same `{ error }` shape as every other non-OK response.
  it("returns the route's message for a 502 (draft generation failed before any chunk)", async () => {
    const response = {
      json: () =>
        Promise.resolve({
          error: "The AI service is unavailable right now. Try again later.",
        }),
    };
    await expect(readDraftError(response)).resolves.toBe(
      "The AI service is unavailable right now. Try again later.",
    );
  });
});

describe("draftOutcomeStatusMessage", () => {
  it("returns 'Draft added.' for a completed draft", () => {
    expect(draftOutcomeStatusMessage({ status: "done" })).toBe("Draft added.");
  });

  it("returns 'Draft stopped.' for a user-aborted draft", () => {
    expect(draftOutcomeStatusMessage({ status: "aborted" })).toBe(
      "Draft stopped.",
    );
  });

  it("returns null for an error, leaving the alert line to show its message", () => {
    expect(
      draftOutcomeStatusMessage({ status: "error", message: "boom" }),
    ).toBeNull();
  });
});

describe("streamDraft", () => {
  it("appends decoded chunks and reports success", async () => {
    const reader = fakeReader(["Hello, ", "client."]);
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        body: { getReader: () => reader },
      }),
    );
    const fetch: DraftFetch = fetchMock;
    const chunks: string[] = [];
    const signal = new AbortController().signal;

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(outcome).toEqual({ status: "done" });
    expect(chunks).toEqual(["Hello, ", "client."]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/proj-1/draft-update",
      { method: "POST", signal },
    );
  });

  it("reports the server's error for a non-OK response without reading a body", async () => {
    const fetch: DraftFetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            error: "Too many AI drafts right now. Try again later.",
          }),
        body: null,
      }),
    );

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    });

    expect(outcome).toEqual({
      status: "error",
      message: "Too many AI drafts right now. Try again later.",
    });
  });

  it("keeps chunks already received and reports a stopped draft on a mid-stream error", async () => {
    const reader = fakeReader(["Partial "], new Error("stream broke"));
    const fetch: DraftFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        body: { getReader: () => reader },
      }),
    );
    const chunks: string[] = [];

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal: new AbortController().signal,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(outcome).toEqual({
      status: "error",
      message: "The draft stopped before it finished.",
    });
    expect(chunks).toEqual(["Partial "]);
  });

  it("reports an aborted stream, not an error, when the signal that broke it was already aborted", async () => {
    const reader = fakeReader(
      ["Partial "],
      new DOMException("Aborted", "AbortError"),
    );
    const fetch: DraftFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        body: { getReader: () => reader },
      }),
    );
    const controller = new AbortController();

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal: controller.signal,
      onChunk: () => controller.abort(),
    });

    expect(outcome).toEqual({ status: "aborted" });
  });

  it("reports an aborted stream when fetch itself rejects after the signal was aborted", async () => {
    const controller = new AbortController();
    const fetch: DraftFetch = vi.fn(() => {
      controller.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal: controller.signal,
      onChunk: vi.fn(),
    });

    expect(outcome).toEqual({ status: "aborted" });
  });

  it("reports a generic error when the response has no body to read", async () => {
    const fetch: DraftFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        body: null,
      }),
    );

    const outcome = await streamDraft({
      fetch,
      projectId: "proj-1",
      signal: new AbortController().signal,
      onChunk: vi.fn(),
    });

    expect(outcome).toEqual({
      status: "error",
      message: "Could not draft the update",
    });
  });
});
