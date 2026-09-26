import { describe, expect, it } from "vitest";
import { logInSchema, signUpSchema } from "@/lib/validation/auth";

describe("signUpSchema", () => {
  it("accepts a valid sign-up", () => {
    const result = signUpSchema.safeParse({
      fullName: "Olivia Owner",
      email: "owner@example.com",
      password: "correct-horse-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      fullName: "Olivia Owner",
      email: "owner@example.com",
      password: "short1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({
      fullName: "Olivia Owner",
      email: "not-an-email",
      password: "correct-horse-1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty full name", () => {
    const result = signUpSchema.safeParse({
      fullName: "",
      email: "owner@example.com",
      password: "correct-horse-1",
    });

    expect(result.success).toBe(false);
  });
});

describe("logInSchema", () => {
  it("accepts a valid login", () => {
    const result = logInSchema.safeParse({
      email: "owner@example.com",
      password: "anything",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = logInSchema.safeParse({
      email: "owner@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});
