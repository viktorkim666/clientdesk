import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const validEnv = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parseEnv", () => {
  it("returns the parsed variables when every required variable is present", () => {
    const env = parseEnv(validEnv);

    expect(env).toEqual(validEnv);
  });

  it("throws when a required variable is missing", () => {
    const withoutUrl: Partial<typeof validEnv> = { ...validEnv };
    delete withoutUrl.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => parseEnv(withoutUrl)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when a required variable is an empty string", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("throws when the Supabase URL is not a valid URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when the site URL is missing", () => {
    const withoutSiteUrl: Partial<typeof validEnv> = { ...validEnv };
    delete withoutSiteUrl.NEXT_PUBLIC_SITE_URL;

    expect(() => parseEnv(withoutSiteUrl)).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("throws when the site URL is not a valid URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXT_PUBLIC_SITE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("throws when the input is undefined", () => {
    expect(() => parseEnv(undefined)).toThrow();
  });

  it("treats optional variables as absent without throwing", () => {
    const env = parseEnv(validEnv);

    expect(env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("treats an empty-string optional variable as absent, not invalid", () => {
    // `.env.local` lines like `RESEND_API_KEY=` load as "", not as a missing key.
    const env = parseEnv({ ...validEnv, RESEND_API_KEY: "" });

    expect(env.RESEND_API_KEY).toBeUndefined();
  });
});
