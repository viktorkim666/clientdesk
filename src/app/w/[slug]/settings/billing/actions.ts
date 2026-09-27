"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { serverEnv } from "@/lib/env.server";
import { env } from "@/lib/env";
import {
  getCurrentWorkspace,
  type CurrentWorkspace,
} from "@/lib/workspace/current";
import { planFromStatus } from "@/lib/billing/plan";
import { syncWorkspaceBilling, toSyncSupabaseClient } from "@/lib/billing/sync";
import type { Database } from "@/types/database";

export type BillingActionResult = { ok: true } | { ok: false; error: string };

const NOT_OWNER_ERROR = "Only the workspace owner can manage billing";
const NOT_CONFIGURED_ERROR = "Billing is not configured";
const STRIPE_ERROR = "Could not reach Stripe. Try again.";
const NO_CUSTOMER_ERROR = "No billing account found for this workspace";

function billingPath(workspaceSlug: string): string {
  return `/w/${workspaceSlug}/settings/billing`;
}

function billingUrl(workspaceSlug: string, query = ""): string {
  return `${env.NEXT_PUBLIC_SITE_URL}${billingPath(workspaceSlug)}${query}`;
}

type OwnerContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workspace: CurrentWorkspace;
};

/**
 * Every billing action is owner-only (see the plan's "Who pays" decision).
 * A Server Action is a public POST endpoint, so this check — and the
 * `isBillingConfigured()` check each caller runs right after — happens
 * before any Stripe or admin-client call, not just before the UI shows the
 * buttons.
 */
async function resolveOwner(
  workspaceSlug: string,
): Promise<{ ok: true; context: OwnerContext } | { ok: false; error: string }> {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, workspaceSlug);
  if (workspace.role !== "owner") {
    return { ok: false, error: NOT_OWNER_ERROR };
  }
  return { ok: true, context: { supabase, workspace } };
}

/**
 * `getStripe()`/`createAdminClient()` already return `null` when a variable
 * is missing; `isBillingConfigured()` covers the case up front so the error
 * message doesn't depend on which single variable happens to be absent.
 */
function resolveBillingClients():
  | { ok: true; stripe: Stripe; admin: SupabaseClient<Database> }
  | { ok: false; error: string } {
  if (!isBillingConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }
  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }
  return { ok: true, stripe, admin };
}

export async function startCheckout(
  workspaceSlug: string,
): Promise<BillingActionResult> {
  const owner = await resolveOwner(workspaceSlug);
  if (!owner.ok) return owner;
  const clients = resolveBillingClients();
  if (!clients.ok) return clients;

  const { supabase, workspace } = owner.context;
  const { stripe, admin } = clients;

  let redirectUrl: string;
  try {
    const { data: billingRow } = await admin
      .from("workspace_billing")
      .select("stripe_customer_id, subscription_status")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (
      billingRow &&
      planFromStatus(billingRow.subscription_status) === "pro"
    ) {
      // Already Pro: there is nothing to check out, so this sends the
      // owner to manage the existing subscription instead.
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: billingRow.stripe_customer_id,
        return_url: billingUrl(workspaceSlug),
      });
      redirectUrl = portalSession.url;
    } else {
      let customerId = billingRow?.stripe_customer_id ?? null;
      if (!customerId) {
        const { data: claims } = await supabase.auth.getClaims();
        const customer = await stripe.customers.create(
          {
            email: claims?.claims.email,
            metadata: { workspace_id: workspace.id },
          },
          // One customer per workspace even if the owner double-clicks or
          // the request is retried.
          { idempotencyKey: `billing-customer-${workspace.id}` },
        );
        // Upsert on workspace_id's own primary key, not a plain insert: a
        // double-click or a retried request races two calls that both
        // read no existing row, but Stripe's idempotency key above means
        // both resolve to the same customer id — the second write must
        // update that row instead of failing a duplicate-key insert on it.
        const { error: upsertError } = await admin
          .from("workspace_billing")
          .upsert(
            {
              workspace_id: workspace.id,
              stripe_customer_id: customer.id,
            },
            { onConflict: "workspace_id" },
          );
        if (upsertError) {
          return { ok: false, error: STRIPE_ERROR };
        }
        customerId = customer.id;
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: workspace.id,
        line_items: [{ price: serverEnv.STRIPE_PRO_PRICE_ID, quantity: 1 }],
        success_url: billingUrl(workspaceSlug, "?checkout=success"),
        cancel_url: billingUrl(workspaceSlug),
      });
      if (!session.url) {
        return { ok: false, error: STRIPE_ERROR };
      }
      redirectUrl = session.url;
    }
  } catch (error) {
    console.error("startCheckout action: Stripe error", error);
    return { ok: false, error: STRIPE_ERROR };
  }

  // Outside the try/catch: redirect() throws NEXT_REDIRECT, which must not
  // be caught as a Stripe failure.
  redirect(redirectUrl);
}

export async function openBillingPortal(
  workspaceSlug: string,
): Promise<BillingActionResult> {
  const owner = await resolveOwner(workspaceSlug);
  if (!owner.ok) return owner;
  const clients = resolveBillingClients();
  if (!clients.ok) return clients;

  const { workspace } = owner.context;
  const { stripe, admin } = clients;

  let redirectUrl: string;
  try {
    const { data: billingRow } = await admin
      .from("workspace_billing")
      .select("stripe_customer_id")
      .eq("workspace_id", workspace.id)
      .maybeSingle();
    if (!billingRow) {
      return { ok: false, error: NO_CUSTOMER_ERROR };
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: billingRow.stripe_customer_id,
      return_url: billingUrl(workspaceSlug),
    });
    redirectUrl = portalSession.url;
  } catch (error) {
    console.error("openBillingPortal action: Stripe error", error);
    return { ok: false, error: STRIPE_ERROR };
  }

  redirect(redirectUrl);
}

export async function resyncBilling(
  workspaceSlug: string,
): Promise<BillingActionResult> {
  const owner = await resolveOwner(workspaceSlug);
  if (!owner.ok) return owner;
  const clients = resolveBillingClients();
  if (!clients.ok) return clients;

  const { workspace } = owner.context;
  const { stripe, admin } = clients;

  let billingRow: { stripe_customer_id: string } | null;
  try {
    ({ data: billingRow } = await admin
      .from("workspace_billing")
      .select("stripe_customer_id")
      .eq("workspace_id", workspace.id)
      .maybeSingle());
  } catch (error) {
    console.error("resyncBilling action: billing row lookup failed", error);
    return { ok: false, error: "Could not refresh billing status" };
  }
  if (!billingRow) {
    return { ok: false, error: NO_CUSTOMER_ERROR };
  }

  try {
    await syncWorkspaceBilling(billingRow.stripe_customer_id, {
      stripe,
      supabase: toSyncSupabaseClient(admin),
    });
  } catch (error) {
    console.error("resyncBilling action: syncWorkspaceBilling failed", error);
    return { ok: false, error: "Could not refresh billing status" };
  }

  revalidatePath(billingPath(workspaceSlug));
  return { ok: true };
}
