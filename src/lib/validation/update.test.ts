import { describe, expect, it } from "vitest";
import { updateSchema } from "@/lib/validation/update";

describe("updateSchema", () => {
  it("accepts a normal body", () => {
    expect(
      updateSchema.safeParse({ body: "Shipped the login page." }).success,
    ).toBe(true);
  });

  it("trims the body", () => {
    const result = updateSchema.safeParse({ body: "  Done for today.  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("Done for today.");
    }
  });

  it("rejects an empty body", () => {
    expect(updateSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a body that is only whitespace", () => {
    expect(updateSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("accepts a body at the 5000 character limit", () => {
    expect(updateSchema.safeParse({ body: "a".repeat(5000) }).success).toBe(
      true,
    );
  });

  it("rejects a body longer than 5000 characters", () => {
    expect(updateSchema.safeParse({ body: "a".repeat(5001) }).success).toBe(
      false,
    );
  });
});
