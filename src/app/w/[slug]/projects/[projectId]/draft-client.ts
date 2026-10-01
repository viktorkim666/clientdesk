// Browser-side counterpart of the streaming route at
// `src/app/api/projects/[projectId]/draft-update/route.ts`. Kept apart from
// `update-form.tsx` so this fetch/stream logic can run under Vitest's node
// environment without React or a DOM (this repo has no jsdom setup - see
// `vitest.config.mts`); the form itself is covered by `e2e/ai-draft.spec.ts`.

import {
  DEMO_LIMIT_ERROR,
  toDemoReason,
  type DemoLimitReason,
} from "@/lib/ai/demo-limit";

const GENERIC_DRAFT_ERROR = "Could not draft the update";

/** Structurally a subset of the real `Response` (and of the `ReadableStream`
 * it wraps), narrow enough to fake in tests without a real fetch/stream. */
export type DraftReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
};

export type DraftResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
  body: { getReader: () => DraftReader } | null;
};

export type DraftFetch = (
  input: string,
  init: { method: "POST"; signal: AbortSignal },
) => Promise<DraftResponse>;

/** Reads the route's `{ error }` string, or `null` for an empty or
 * unparseable body. `reason` rides along on the demo limit only. */
async function readErrorBody(response: {
  json: () => Promise<unknown>;
}): Promise<{ error: string | null; reason: unknown }> {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      reason?: unknown;
    };
    return {
      error:
        typeof body.error === "string" && body.error.length > 0
          ? body.error
          : null,
      reason: body.reason,
    };
  } catch {
    return { error: null, reason: undefined };
  }
}

/** Maps the route's `{ error }` JSON body to a message for the alert line;
 * falls back to a generic message for an empty or unparseable body. */
export async function readDraftError(response: {
  json: () => Promise<unknown>;
}): Promise<string> {
  return (await readErrorBody(response)).error ?? GENERIC_DRAFT_ERROR;
}

export type StreamDraftOutcome =
  | { status: "done" }
  | { status: "aborted" }
  | { status: "demo_limit"; reason: DemoLimitReason }
  | { status: "error"; message: string };

/**
 * Maps a finished `streamDraft` outcome to the persistent status line the
 * form shows after drafting - `null` for `"error"` and `"demo_limit"`, which
 * use alert lines of their own instead, since those already have a message
 * to show.
 */
export function draftOutcomeStatusMessage(
  outcome: StreamDraftOutcome,
): string | null {
  switch (outcome.status) {
    case "done":
      return "Draft added.";
    case "aborted":
      return "Draft stopped.";
    case "error":
    case "demo_limit":
      return null;
  }
}

/**
 * Posts to the draft-update route and appends decoded chunks to the
 * textarea via `onChunk` as they arrive. An abort (the user clicking
 * "Stop", or unmounting) ends the read loop the same way a network failure
 * does, so it's told apart here by checking `signal.aborted` rather than by
 * inspecting the thrown error - it isn't a failure worth showing.
 */
export async function streamDraft({
  fetch,
  projectId,
  signal,
  onChunk,
}: {
  fetch: DraftFetch;
  projectId: string;
  signal: AbortSignal;
  onChunk: (chunk: string) => void;
}): Promise<StreamDraftOutcome> {
  let response: DraftResponse;
  try {
    response = await fetch(`/api/projects/${projectId}/draft-update`, {
      method: "POST",
      signal,
    });
  } catch {
    return signal.aborted
      ? { status: "aborted" }
      : { status: "error", message: GENERIC_DRAFT_ERROR };
  }

  if (!response.ok) {
    const { error, reason } = await readErrorBody(response);
    if (error === DEMO_LIMIT_ERROR) {
      return {
        status: "demo_limit",
        reason: toDemoReason(reason),
      };
    }
    return { status: "error", message: error ?? GENERIC_DRAFT_ERROR };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return { status: "error", message: GENERIC_DRAFT_ERROR };
  }

  const decoder = new TextDecoder();
  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      if (chunk.value) {
        onChunk(decoder.decode(chunk.value, { stream: true }));
      }
    }
    return { status: "done" };
  } catch {
    // The route's own mid-stream error (`controller.error(...)`) reaches
    // here the same way an aborted read does; whatever was already
    // enqueued has already reached `onChunk`, so the caller keeps it.
    return signal.aborted
      ? { status: "aborted" }
      : { status: "error", message: "The draft stopped before it finished." };
  }
}
