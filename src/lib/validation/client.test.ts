import { describe, expect, it } from "vitest";
import { clientNameSchema } from "@/lib/validation/client";

describe("clientNameSchema", () => {
  it("accepts a normal name", () => {
    expect(clientNameSchema.safeParse({ name: "Client A Inc." }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(clientNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name longer than 100 characters", () => {
    expect(clientNameSchema.safeParse({ name: "a".repeat(101) }).success).toBe(
      false,
    );
  });
});
