import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";

describe("getStripe", () => {
  it("returns null when the secret key is undefined", () => {
    expect(getStripe(undefined)).toBeNull();
  });

  it("returns a Stripe client when a secret key is given", () => {
    const stripe = getStripe("sk_test_123");

    expect(stripe).toBeInstanceOf(Stripe);
  });
});

const configured = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  STRIPE_PRO_PRICE_ID: "price_123",
  SUPABASE_SECRET_KEY: "sb_secret_123",
};

describe("isBillingConfigured", () => {
  it("is true when every variable is set", () => {
    expect(isBillingConfigured(configured)).toBe(true);
  });

  it("is false when any one variable is missing", () => {
    for (const key of Object.keys(configured) as (keyof typeof configured)[]) {
      const partial = { ...configured, [key]: undefined };

      expect(isBillingConfigured(partial)).toBe(false);
    }
  });

  it("is false when nothing is set", () => {
    expect(isBillingConfigured({})).toBe(false);
  });
});
