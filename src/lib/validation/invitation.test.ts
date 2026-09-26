import { describe, expect, it } from "vitest";
import { inviteSchema } from "@/lib/validation/invitation";

const clientId = "bab4cc25-726d-4fe0-a153-91d24fe07f10";

describe("inviteSchema", () => {
  it("accepts an owner invite with no client id", () => {
    expect(
      inviteSchema.safeParse({ email: "a@example.com", role: "owner" }).success,
    ).toBe(true);
  });

  it("accepts a member invite with no client id", () => {
    expect(
      inviteSchema.safeParse({ email: "a@example.com", role: "member" })
        .success,
    ).toBe(true);
  });

  it("accepts a client invite that includes a client id", () => {
    expect(
      inviteSchema.safeParse({
        email: "a@example.com",
        role: "client",
        clientId,
      }).success,
    ).toBe(true);
  });

  it("rejects a client invite with no client id", () => {
    expect(
      inviteSchema.safeParse({ email: "a@example.com", role: "client" })
        .success,
    ).toBe(false);
  });

  it("rejects an owner invite that also sets a client id", () => {
    expect(
      inviteSchema.safeParse({
        email: "a@example.com",
        role: "owner",
        clientId,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteSchema.safeParse({ email: "not-an-email", role: "owner" }).success,
    ).toBe(false);
  });

  it("rejects a role outside the enum", () => {
    expect(
      inviteSchema.safeParse({ email: "a@example.com", role: "superadmin" })
        .success,
    ).toBe(false);
  });
});
