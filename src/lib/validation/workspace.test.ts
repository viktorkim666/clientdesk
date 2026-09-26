import { describe, expect, it } from "vitest";
import { workspaceNameSchema } from "@/lib/validation/workspace";

describe("workspaceNameSchema", () => {
  it("accepts a normal name", () => {
    expect(workspaceNameSchema.safeParse({ name: "Acme Agency" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(workspaceNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name that is only whitespace", () => {
    expect(workspaceNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name longer than 60 characters", () => {
    expect(
      workspaceNameSchema.safeParse({ name: "a".repeat(61) }).success,
    ).toBe(false);
  });
});
