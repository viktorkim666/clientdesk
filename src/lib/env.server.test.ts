import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env.server";

describe("parseServerEnv", () => {
  it("returns every variable as undefined when none are set", () => {
    const env = parseServerEnv({});

    expect(env).toEqual({
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      STRIPE_PRO_PRICE_ID: undefined,
      SUPABASE_SECRET_KEY: undefined,
    });
  });

  it("returns the parsed variables when every variable is set", () => {
    const raw = {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      STRIPE_PRO_PRICE_ID: "price_123",
      SUPABASE_SECRET_KEY: "sb_secret_123",
    };

    const env = parseServerEnv(raw);

    expect(env).toEqual(raw);
  });

  it("treats an empty-string variable as absent, not invalid", () => {
    // `.env.local` lines like `STRIPE_SECRET_KEY=` load as "", not as a
    // missing key.
    const env = parseServerEnv({ STRIPE_SECRET_KEY: "" });

    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("throws when the input is undefined", () => {
    expect(() => parseServerEnv(undefined)).toThrow();
  });
});
