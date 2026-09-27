import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";
import { createAnthropicDraftGenerator } from "@/lib/ai/anthropic-generator";
import { fakeDraftGenerator } from "@/lib/ai/fake-generator";
import type { DraftGenerator } from "@/lib/ai/draft-generator";

export type { DraftGenerator, DraftPrompt } from "@/lib/ai/draft-generator";
export { DraftGenerationError } from "@/lib/ai/draft-generator";

/**
 * Picks the draft backend by whether `ANTHROPIC_API_KEY` is set (mirrors
 * `getEmailSender`). Without a key, the fake generator is used outside
 * production so local work and CI run the whole flow without one; in
 * production without a key this returns `null`, and the caller shows "AI
 * drafting is not configured" (the plan's "Configuration" decision, same
 * shape as `isBillingConfigured`).
 */
export function getDraftGenerator({
  apiKey = serverEnv.ANTHROPIC_API_KEY,
  nodeEnv = process.env.NODE_ENV,
}: { apiKey?: string; nodeEnv?: string } = {}): DraftGenerator | null {
  if (apiKey) {
    return createAnthropicDraftGenerator(new Anthropic({ apiKey }));
  }
  return nodeEnv === "production" ? null : fakeDraftGenerator;
}
