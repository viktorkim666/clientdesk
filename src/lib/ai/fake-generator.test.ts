import { describe, expect, it } from "vitest";
import { fakeDraftGenerator } from "@/lib/ai/fake-generator";
import type { DraftPrompt } from "@/lib/ai/draft-generator";

const PROMPT: DraftPrompt = {
  system: "irrelevant for the fake",
  user:
    "<activity>\nProject: Website Redesign\nClient: Acme Inc\nStatus: active\n\n" +
    "- [update] Jane Doe (2026-09-25T00:00:00.000Z): Shipped the homepage.\n" +
    "- [file] Jane Doe (2026-09-24T00:00:00.000Z): brief.pdf\n" +
    "</activity>",
};

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("fakeDraftGenerator", () => {
  it("streams a deterministic draft built from the prompt's activity, in several chunks", async () => {
    const controller = new AbortController();

    const chunks = await collect(
      fakeDraftGenerator.generate(PROMPT, controller.signal),
    );

    expect(chunks.length).toBeGreaterThan(1);
    const draft = chunks.join("");
    expect(draft).toContain("Website Redesign");
    expect(draft).toContain("Shipped the homepage.");
    expect(draft).toContain("brief.pdf");
  });

  it("produces the same draft for the same prompt", async () => {
    const first = (
      await collect(
        fakeDraftGenerator.generate(PROMPT, new AbortController().signal),
      )
    ).join("");
    const second = (
      await collect(
        fakeDraftGenerator.generate(PROMPT, new AbortController().signal),
      )
    ).join("");

    expect(first).toBe(second);
  });

  it("stops yielding once the signal aborts", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];

    controller.abort();
    for await (const chunk of fakeDraftGenerator.generate(
      PROMPT,
      controller.signal,
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([]);
  });
});
