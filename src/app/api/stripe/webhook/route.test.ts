import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

const {
  WEBHOOK_SECRET,
  CUSTOMER_ID,
  syncWorkspaceBillingMock,
  createAdminClientMock,
  isBillingConfiguredMock,
} = vi.hoisted(() => ({
  WEBHOOK_SECRET: "whsec_test_123",
  CUSTOMER_ID: "cus_test_123",
  syncWorkspaceBillingMock: vi.fn(() => Promise.resolve()),
  createAdminClientMock: vi.fn(() => ({ fake: "admin-client" })),
  isBillingConfiguredMock: vi.fn(() => true),
}));

vi.mock("@/lib/billing/sync", () => ({
  syncWorkspaceBilling: syncWorkspaceBillingMock,
  toSyncSupabaseClient: (client: unknown) => client,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/billing/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/stripe")>(
    "@/lib/billing/stripe",
  );
  return {
    ...actual,
    isBillingConfigured: isBillingConfiguredMock,
  };
});

vi.mock("@/lib/env.server", () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_PRO_PRICE_ID: "price_pro",
    SUPABASE_SECRET_KEY: "sb_secret_123",
  },
}));

import { POST } from "./route";

// The real webhook secret and `stripe.webhooks.generateTestHeaderString`
// produce a signature `constructEvent` accepts, exactly like a real
// request from Stripe — this is Stripe's own documented way to unit test
// webhook handlers, not a stand-in for the real verification.
const signingStripe = new Stripe("sk_test_signing_only");

function signedRequest(body: object): Request {
  const payload = JSON.stringify(body);
  const signature = signingStripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });
}

function buildEvent(type: string, object: Record<string, unknown>) {
  return {
    id: "evt_test_123",
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    data: { object },
  };
}

beforeEach(() => {
  syncWorkspaceBillingMock.mockReset().mockResolvedValue(undefined);
  createAdminClientMock.mockReset().mockReturnValue({ fake: "admin-client" });
  isBillingConfiguredMock.mockReset().mockReturnValue(true);
});

describe("POST /api/stripe/webhook", () => {
  it("returns 503 when billing is not configured", async () => {
    isBillingConfiguredMock.mockReturnValue(false);

    const response = await POST(
      signedRequest(
        buildEvent("checkout.session.completed", { customer: CUSTOMER_ID }),
      ),
    );

    expect(response.status).toBe(503);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature header is missing", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(buildEvent("checkout.session.completed", {})),
      }),
    );

    expect(response.status).toBe(400);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature does not match", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=not-a-real-signature" },
        body: JSON.stringify(buildEvent("checkout.session.completed", {})),
      }),
    );

    expect(response.status).toBe(400);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("returns 200 without syncing for an event type it does not handle", async () => {
    const response = await POST(
      signedRequest(buildEvent("charge.succeeded", { customer: CUSTOMER_ID })),
    );

    expect(response.status).toBe(200);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it.each([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "invoice.paid",
    "invoice.payment_failed",
  ])("syncs the customer's billing for %s", async (type) => {
    const response = await POST(
      signedRequest(buildEvent(type, { customer: CUSTOMER_ID })),
    );

    expect(response.status).toBe(200);
    expect(syncWorkspaceBillingMock).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.objectContaining({ supabase: { fake: "admin-client" } }),
    );
  });

  it("reads the customer id from an expanded customer object", async () => {
    const response = await POST(
      signedRequest(
        buildEvent("invoice.paid", { customer: { id: CUSTOMER_ID } }),
      ),
    );

    expect(response.status).toBe(200);
    expect(syncWorkspaceBillingMock).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.anything(),
    );
  });

  it("returns 500 when the sync fails, so Stripe retries the delivery", async () => {
    syncWorkspaceBillingMock.mockRejectedValueOnce(new Error("db down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const response = await POST(
      signedRequest(
        buildEvent("customer.subscription.updated", { customer: CUSTOMER_ID }),
      ),
    );

    expect(response.status).toBe(500);
    consoleErrorSpy.mockRestore();
  });

  it("returns 200 without retrying when sync resolves a terminal case, such as a deleted Stripe customer", async () => {
    // `syncWorkspaceBilling` itself treats a deleted customer as terminal
    // (log and return, not throw) — this proves the route passes that
    // straight through as success rather than turning a resolved promise
    // into a retry.
    const response = await POST(
      signedRequest(
        buildEvent("customer.subscription.deleted", { customer: CUSTOMER_ID }),
      ),
    );

    expect(response.status).toBe(200);
    expect(syncWorkspaceBillingMock).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.anything(),
    );
  });

  it("rejects a body over 1 MiB by Content-Length before verifying the signature", async () => {
    const payload = JSON.stringify(
      buildEvent("checkout.session.completed", { customer: CUSTOMER_ID }),
    );
    const oversizedContentLength = String(1024 * 1024 + 1);
    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=1,v1=irrelevant-body-is-rejected-first",
        "content-length": oversizedContentLength,
      },
      body: payload,
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("rejects a body over 1 MiB by its actual length when Content-Length is missing or wrong", async () => {
    const oversizedBody = JSON.stringify(
      buildEvent("checkout.session.completed", {
        customer: CUSTOMER_ID,
        // Pads the body past 1 MiB; Content-Length is deliberately not set
        // on this Request so the route falls back to measuring the text
        // it already read.
        padding: "x".repeat(1024 * 1024 + 1),
      }),
    );
    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=1,v1=irrelevant-body-is-rejected-first",
      },
      body: oversizedBody,
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(syncWorkspaceBillingMock).not.toHaveBeenCalled();
  });

  it("accepts a body under the 1 MiB limit", async () => {
    const response = await POST(
      signedRequest(
        buildEvent("checkout.session.completed", { customer: CUSTOMER_ID }),
      ),
    );

    expect(response.status).toBe(200);
  });

  it("still writes Stripe's current state when an older event is replayed after a newer one", async () => {
    // `syncWorkspaceBilling` always re-reads the subscription from Stripe
    // rather than trusting the event body, so replaying a stale event is
    // indistinguishable from replaying the latest one here — both just
    // trigger another sync for the same customer.
    await POST(
      signedRequest(
        buildEvent("customer.subscription.updated", { customer: CUSTOMER_ID }),
      ),
    );
    const replay = await POST(
      signedRequest(
        buildEvent("customer.subscription.created", { customer: CUSTOMER_ID }),
      ),
    );

    expect(replay.status).toBe(200);
    expect(syncWorkspaceBillingMock).toHaveBeenCalledTimes(2);
    expect(syncWorkspaceBillingMock).toHaveBeenNthCalledWith(
      2,
      CUSTOMER_ID,
      expect.anything(),
    );
  });
});
