import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/invitations/token";

describe("generateInvitationToken", () => {
  it("generates a URL-safe token with no padding characters", () => {
    const token = generateInvitationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a different token on every call", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();

    expect(a).not.toBe(b);
  });
});

describe("hashInvitationToken", () => {
  it("hashes the same token to the same value", () => {
    expect(hashInvitationToken("my-token")).toBe(
      hashInvitationToken("my-token"),
    );
  });

  it("hashes different tokens to different values", () => {
    expect(hashInvitationToken("token-a")).not.toBe(
      hashInvitationToken("token-b"),
    );
  });

  it("returns a lowercase hex sha-256 digest, matching extensions.digest(..., 'sha256') in Postgres", () => {
    // node -e "require('crypto').createHash('sha256').update('my-token').digest('hex')"
    expect(hashInvitationToken("my-token")).toBe(
      "fece50d2287f7245aea5819b75f95ee8bec295a14f8ef1e7a31f17f1dae9df44",
    );
  });
});
