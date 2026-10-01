import { describe, expect, it } from "vitest";
import {
  DEMO_AI_DRAFT_LIMIT,
  DEMO_LIMIT_ERROR,
  demoLimitMessage,
  SAMPLE_DRAFT,
  toDemoReason,
} from "./demo-limit";

describe("DEMO_LIMIT_ERROR", () => {
  it("is the flag the route sends with a 429", () => {
    expect(DEMO_LIMIT_ERROR).toBe("demo_limit");
  });
});

describe("toDemoReason", () => {
  it("keeps the two known reasons", () => {
    expect(toDemoReason("budget")).toBe("budget");
    expect(toDemoReason("sandbox")).toBe("sandbox");
  });

  it.each([undefined, null, "", "other", 42, { reason: "budget" }])(
    "maps an unknown reason (%j) to the sandbox limit",
    (value) => {
      expect(toDemoReason(value)).toBe("sandbox");
    },
  );
});

describe("demoLimitMessage", () => {
  it("names the 3 drafts of the sandbox and offers the sample", () => {
    expect(demoLimitMessage("sandbox")).toBe(
      "You've used the 3 AI drafts in this demo. Here's a sample draft you can still edit and publish.",
    );
    expect(DEMO_AI_DRAFT_LIMIT).toBe(3);
  });

  it("does not blame the visitor when the daily demo budget is spent", () => {
    const message = demoLimitMessage("budget");

    expect(message).toContain("today");
    expect(message).not.toContain("You've used");
    expect(message).toContain("sample draft");
  });
});

describe("SAMPLE_DRAFT", () => {
  it("is a ready-to-publish weekly update, not a placeholder", () => {
    expect(SAMPLE_DRAFT.length).toBeGreaterThan(200);
    expect(SAMPLE_DRAFT.length).toBeLessThanOrEqual(2000);
    expect(SAMPLE_DRAFT).toMatch(/this week/i);
  });

  it("is a neutral template that claims no concrete work", () => {
    expect(SAMPLE_DRAFT).not.toMatch(
      /mockup|design|uploaded|finished|approved|first build|thursday/i,
    );
  });

  it("carries no label of its own, so publishing it posts only the update", () => {
    expect(SAMPLE_DRAFT.toLowerCase()).not.toContain("sample");
  });
});
