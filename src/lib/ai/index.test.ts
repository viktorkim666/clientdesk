import { describe, expect, it } from "vitest";
import { getDraftGenerator } from "@/lib/ai";
import { fakeDraftGenerator } from "@/lib/ai/fake-generator";

describe("getDraftGenerator", () => {
  it("returns the fake generator when no API key is set and not in production", () => {
    const generator = getDraftGenerator({
      apiKey: undefined,
      nodeEnv: "test",
    });

    expect(generator).toBe(fakeDraftGenerator);
  });

  it("returns an Anthropic-backed generator when an API key is set", () => {
    const generator = getDraftGenerator({
      apiKey: "sk-ant-test-123",
      nodeEnv: "test",
    });

    expect(generator).not.toBe(fakeDraftGenerator);
    expect(generator).not.toBeNull();
    expect(typeof generator?.generate).toBe("function");
  });

  it("returns null in production when no API key is set", () => {
    const generator = getDraftGenerator({
      apiKey: undefined,
      nodeEnv: "production",
    });

    expect(generator).toBeNull();
  });

  it("returns an Anthropic-backed generator in production when an API key is set", () => {
    const generator = getDraftGenerator({
      apiKey: "sk-ant-test-123",
      nodeEnv: "production",
    });

    expect(generator).not.toBeNull();
  });
});
