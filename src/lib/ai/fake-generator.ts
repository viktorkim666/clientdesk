import type { DraftGenerator, DraftPrompt } from "@/lib/ai/draft-generator";

/**
 * `buildDraftPrompt` folds a project's activity into `prompt.user` as
 * `Project: <name>` plus one `- [kind] author (date): text` line per item
 * (see `src/lib/ai/prompt.ts`) - reading it back out here keeps the fake
 * built from the same activity a real generator would see, instead of a
 * canned string unrelated to the request.
 */
function extractProjectName(promptUserText: string): string {
  const match = /^Project: (.+)$/m.exec(promptUserText);
  return match ? match[1] : "this project";
}

function extractItemLines(promptUserText: string): string[] {
  return promptUserText
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map((line) => line.replace(/^- \[[a-z]+\]\s*/, ""));
}

/**
 * Streams a fixed, deterministic draft built from the prompt's activity -
 * used locally and in tests/CI (no `ANTHROPIC_API_KEY`), the same way
 * `consoleEmailSender` stands in for Resend (see the plan's "Configuration"
 * decision).
 */
export const fakeDraftGenerator: DraftGenerator = {
  async *generate(prompt: DraftPrompt, signal: AbortSignal) {
    const projectName = extractProjectName(prompt.user);
    const itemLines = extractItemLines(prompt.user);

    const lines = [
      `Here is what happened on ${projectName} this week:`,
      ...(itemLines.length > 0 ? itemLines : ["Nothing new to report."]),
    ];

    for (const line of lines) {
      // Yields across a microtask boundary, like a real network stream,
      // so a caller that reads chunk by chunk actually sees several of
      // them instead of one synchronous burst.
      await Promise.resolve();
      if (signal.aborted) {
        return;
      }
      yield `${line}\n`;
    }
  },
};
