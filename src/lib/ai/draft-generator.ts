import type { DraftPrompt } from "@/lib/ai/prompt";

export type { DraftPrompt };

/** Any draft backend implements this — the fake locally/in tests, Anthropic in production. */
export interface DraftGenerator {
  generate(prompt: DraftPrompt, signal: AbortSignal): AsyncIterable<string>;
}

/**
 * Wraps a failure from the underlying draft backend (the Anthropic SDK
 * today). Callers can catch this one type instead of every SDK error class;
 * the original error is kept as `cause` for logging.
 */
export class DraftGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftGenerationError";
  }
}
