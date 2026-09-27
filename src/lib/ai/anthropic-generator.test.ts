import { describe, expect, it } from "vitest";
import {
  createAnthropicDraftGenerator,
  DRAFT_MODEL,
} from "@/lib/ai/anthropic-generator";
import { DraftGenerationError } from "@/lib/ai/draft-generator";
import type { DraftAnthropicClient } from "@/lib/ai/anthropic-generator";
import type { DraftPrompt } from "@/lib/ai/draft-generator";

const PROMPT: DraftPrompt = {
  system: "You write client updates.",
  user: "<activity>...</activity>",
};

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

/** A fake `DraftAnthropicClient` that yields the given events from
 * `messages.stream()`, capturing the body and options it was called with. */
function fakeClient(
  events: { type: string; delta?: { type: string; text?: string } }[],
  options: { throws?: Error; throwsMidStream?: Error } = {},
): {
  client: DraftAnthropicClient;
  calls: { body: unknown; options: { signal: AbortSignal } }[];
} {
  const calls: { body: unknown; options: { signal: AbortSignal } }[] = [];

  return {
    client: {
      messages: {
        stream: (body, streamOptions) => {
          calls.push({ body, options: streamOptions });
          if (options.throws) {
            throw options.throws;
          }
          return (async function* () {
            for (const event of events) {
              await Promise.resolve();
              yield event;
            }
            if (options.throwsMidStream) {
              throw options.throwsMidStream;
            }
          })();
        },
      },
    },
    calls,
  };
}

describe("createAnthropicDraftGenerator", () => {
  it("yields text deltas in order", async () => {
    const { client } = fakeClient([
      { type: "message_start" },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello, " },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "world." },
      },
      { type: "message_stop" },
    ]);
    const generator = createAnthropicDraftGenerator(client);

    const chunks = await collect(
      generator.generate(PROMPT, new AbortController().signal),
    );

    expect(chunks).toEqual(["Hello, ", "world."]);
  });

  it("ignores non-text deltas (input_json, thinking, etc.)", async () => {
    const { client } = fakeClient([
      {
        type: "content_block_delta",
        delta: { type: "input_json_delta" },
      },
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Only this." },
      },
    ]);
    const generator = createAnthropicDraftGenerator(client);

    const chunks = await collect(
      generator.generate(PROMPT, new AbortController().signal),
    );

    expect(chunks).toEqual(["Only this."]);
  });

  it("forwards the prompt, the model and the abort signal to the client", async () => {
    const { client, calls } = fakeClient([]);
    const generator = createAnthropicDraftGenerator(client);
    const controller = new AbortController();

    await collect(generator.generate(PROMPT, controller.signal));

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call?.options.signal).toBe(controller.signal);
    expect(call?.body).toMatchObject({
      model: DRAFT_MODEL,
      max_tokens: 800,
      system: PROMPT.system,
      messages: [{ role: "user", content: PROMPT.user }],
    });
  });

  it("ends quietly when the signal is already aborted", async () => {
    const { client, calls } = fakeClient([
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "should not appear" },
      },
    ]);
    const generator = createAnthropicDraftGenerator(client);
    const controller = new AbortController();
    controller.abort();

    const chunks = await collect(generator.generate(PROMPT, controller.signal));

    expect(chunks).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("wraps a client error in DraftGenerationError", async () => {
    const { client } = fakeClient([], { throws: new Error("rate limited") });
    const generator = createAnthropicDraftGenerator(client);

    await expect(
      collect(generator.generate(PROMPT, new AbortController().signal)),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });

  it("uses a neutral message when the stream rejects before any text, e.g. zero credits", async () => {
    const { client } = fakeClient([], {
      throwsMidStream: new Error("insufficient credits"),
    });
    const generator = createAnthropicDraftGenerator(client);

    await expect(
      collect(generator.generate(PROMPT, new AbortController().signal)),
    ).rejects.toThrow(/^The draft generator failed$/);
  });
});
