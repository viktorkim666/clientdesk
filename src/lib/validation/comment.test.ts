import { describe, expect, it } from "vitest";
import { commentSchema } from "@/lib/validation/comment";

const updateId = "bab4cc25-726d-4fe0-a153-91d24fe07f10";

describe("commentSchema", () => {
  it("accepts a normal comment", () => {
    expect(
      commentSchema.safeParse({ updateId, body: "Looks great, thanks!" })
        .success,
    ).toBe(true);
  });

  it("trims the body", () => {
    const result = commentSchema.safeParse({ updateId, body: "  Thanks!  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("Thanks!");
    }
  });

  it("rejects an empty body", () => {
    expect(commentSchema.safeParse({ updateId, body: "" }).success).toBe(false);
  });

  it("rejects a body that is only whitespace", () => {
    expect(commentSchema.safeParse({ updateId, body: "   " }).success).toBe(
      false,
    );
  });

  it("accepts a body at the 2000 character limit", () => {
    expect(
      commentSchema.safeParse({ updateId, body: "a".repeat(2000) }).success,
    ).toBe(true);
  });

  it("rejects a body longer than 2000 characters", () => {
    expect(
      commentSchema.safeParse({ updateId, body: "a".repeat(2001) }).success,
    ).toBe(false);
  });

  it("rejects an update id that is not a uuid", () => {
    expect(
      commentSchema.safeParse({ updateId: "not-a-uuid", body: "Thanks!" })
        .success,
    ).toBe(false);
  });
});
