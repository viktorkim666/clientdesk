import type Stripe from "stripe";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env.server";
import { syncWorkspaceBilling, toSyncSupabaseClient } from "@/lib/billing/sync";

// Every event that can change what a customer owes or is entitled to.
// Handling all of them the same way — re-read the subscription, don't trust
// the event body — is what makes event order and duplicate deliveries
// harmless (see the plan's "Source of truth" decision).
const HANDLED_EVENT_TYPES = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

function customerIdFrom(event: Stripe.Event): string | null {
  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const { customer } = event.data.object;
      if (!customer) return null;
      return typeof customer === "string" ? customer : customer.id;
    }
    default:
      return null;
  }
}

// Stripe's own event payloads are a few KB; 1 MiB is generous headroom for
// a legitimate event while still rejecting a body large enough to be a
// denial-of-service attempt before it reaches signature verification.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!isBillingConfigured()) {
    return Response.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();

  // A missing or dishonest Content-Length header doesn't skip the limit:
  // this measures the body actually read, in bytes rather than
  // `payload.length`'s UTF-16 code units.
  if (Buffer.byteLength(payload, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  const stripe = getStripe();

  if (!stripe || !signature) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      // `isBillingConfigured()` above already confirmed this is set.
      serverEnv.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return Response.json({ received: true });
  }

  const customerId = customerIdFrom(event);
  if (!customerId) {
    return Response.json({ received: true });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return Response.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  try {
    await syncWorkspaceBilling(customerId, {
      stripe,
      supabase: toSyncSupabaseClient(supabase),
    });
  } catch (error) {
    console.error("stripe webhook: syncWorkspaceBilling failed", error);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
