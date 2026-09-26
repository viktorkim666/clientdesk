import { afterEach, describe, expect, it, vi } from "vitest";

describe("isGoogleAuthEnabled", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/env");
  });

  it("is false when neither Google env var is set", async () => {
    vi.doMock("@/lib/env", () => ({ env: {} }));
    const { isGoogleAuthEnabled } = await import("@/lib/auth/google");

    expect(isGoogleAuthEnabled()).toBe(false);
  });

  it("is false when only the client id is set", async () => {
    vi.doMock("@/lib/env", () => ({
      env: { SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "id" },
    }));
    const { isGoogleAuthEnabled } = await import("@/lib/auth/google");

    expect(isGoogleAuthEnabled()).toBe(false);
  });

  it("is true when both Google env vars are set", async () => {
    vi.doMock("@/lib/env", () => ({
      env: {
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "id",
        SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: "secret",
      },
    }));
    const { isGoogleAuthEnabled } = await import("@/lib/auth/google");

    expect(isGoogleAuthEnabled()).toBe(true);
  });
});
