import "server-only";
import {
  DraftGenerationError,
  type DraftGenerator,
  type DraftPrompt,
} from "@/lib/ai/draft-generator";

// A `claude-haiku-4-5-20251001`-generation model, chosen at Gate 1 for a
// cheaper, faster public demo (see the plan's "Model" decision). A single
// constant here keeps changing it a one-line diff.
export const DRAFT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 800;

/** The shape of event this generator reads off `messages.stream()`. `delta`
 * is `unknown` (not just optional) because the real SDK's own event union
 * shapes it differently per event `type` - `isTextDelta` below narrows it
 * for the one case this generator cares about, a `content_block_delta`
 * carrying a `text_delta`. Every other event type (`message_start`,
 * `input_json_delta`, `thinking_delta`, ...) is ignored. */
interface DraftStreamEvent {
  type: string;
  delta?: unknown;
}

function isTextDelta(
  delta: unknown,
): delta is { type: "text_delta"; text: string } {
  return (
    typeof delta === "object" &&
    delta !== null &&
    "type" in delta &&
    delta.type === "text_delta" &&
    "text" in delta &&
    typeof delta.text === "string"
  );
}

/**
 * The one Anthropic SDK call this generator makes, and nothing else -
 * narrow enough that tests can inject a plain object instead of a real
 * `Anthropic` client (mirrors `SyncStripeClient` in `src/lib/billing/sync.ts`).
 * The real client's `messages.stream()` structurally satisfies this.
 */
export interface DraftAnthropicClient {
  messages: {
    stream: (
      body: {
        model: string;
        max_tokens: number;
        system: string;
        messages: { role: "user"; content: string }[];
      },
      options: { signal: AbortSignal },
    ) => AsyncIterable<DraftStreamEvent>;
  };
}

/**
 * Builds a `DraftGenerator` backed by the Anthropic Messages API. Forwards
 * `signal` so closing the page aborts the Claude call (the plan's
 * "Transport" decision); an abort ends the stream quietly instead of
 * surfacing as a `DraftGenerationError`, since the caller asked for it.
 */
export function createAnthropicDraftGenerator(
  client: DraftAnthropicClient,
): DraftGenerator {
  return {
    async *generate(prompt: DraftPrompt, signal: AbortSignal) {
      if (signal.aborted) {
        return;
      }

      let stream: AsyncIterable<DraftStreamEvent>;
      try {
        stream = client.messages.stream(
          {
            model: DRAFT_MODEL,
            max_tokens: MAX_TOKENS,
            system: prompt.system,
            messages: [{ role: "user", content: prompt.user }],
          },
          { signal },
        );
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        throw new DraftGenerationError("The draft generator failed to start", {
          cause: error,
        });
      }

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            isTextDelta(event.delta)
          ) {
            yield event.delta.text;
          }
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        throw new DraftGenerationError("The draft generator failed", {
          cause: error,
        });
      }
    },
  };
}
