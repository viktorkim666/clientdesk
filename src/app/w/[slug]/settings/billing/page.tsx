import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { syncWorkspaceBilling, toSyncSupabaseClient } from "@/lib/billing/sync";
import { FREE_CLIENT_LIMIT, planFromStatus } from "@/lib/billing/plan";
import { BillingActions } from "./billing-actions";

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  // Billing is owner/member business, per the plan's "Who pays" decision;
  // a client gets the same 404 as any other page they aren't meant to see.
  if (workspace.role === "client") {
    notFound();
  }

  const configured = isBillingConfigured();

  // Stripe's redirect back from Checkout can arrive before its webhook
  // does; running the same sync the webhook runs here closes that gap for
  // the owner who just paid, instead of showing them a stale Free plan.
  if (checkout === "success" && configured && workspace.role === "owner") {
    const stripe = getStripe();
    const admin = createAdminClient();
    if (stripe && admin) {
      const { data: pendingRow } = await admin
        .from("workspace_billing")
        .select("stripe_customer_id")
        .eq("workspace_id", workspace.id)
        .maybeSingle();
      if (pendingRow) {
        try {
          await syncWorkspaceBilling(pendingRow.stripe_customer_id, {
            stripe,
            supabase: toSyncSupabaseClient(admin),
          });
        } catch (error) {
          console.error("billing page: post-checkout sync failed", error);
        }
      }
    }

    // Outside the try/catch, and unconditional on the sync's own outcome:
    // this consumes `?checkout=success` after one owner-only sync attempt
    // so a refresh of this URL renders normally instead of re-syncing on
    // every load. `redirect()` throws NEXT_REDIRECT, which must not be
    // caught as a sync failure.
    redirect(`/w/${workspace.slug}/settings/billing`);
  }

  const [{ data: billingRow }, { count: clientCount }] = await Promise.all([
    supabase
      .from("workspace_billing")
      .select("subscription_status, current_period_end, cancel_at")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id),
  ]);

  const plan = planFromStatus(billingRow?.subscription_status ?? null);
  const renewalDate =
    plan === "pro" && billingRow?.current_period_end
      ? new Date(billingRow.current_period_end).toLocaleDateString()
      : null;
  const cancelDate =
    plan === "pro" && billingRow?.cancel_at
      ? new Date(billingRow.cancel_at).toLocaleDateString()
      : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan
            <Badge variant={plan === "pro" ? "default" : "secondary"}>
              {plan === "pro" ? "Pro" : "Free"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {plan === "free"
              ? `${clientCount ?? 0} / ${FREE_CLIENT_LIMIT} clients used`
              : "Unlimited clients"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cancelDate ? (
            <p className="text-sm text-muted-foreground">
              Cancels on {cancelDate}
            </p>
          ) : renewalDate ? (
            <p className="text-sm text-muted-foreground">
              Renews on {renewalDate}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Billing runs in Stripe test mode. Use test card 4242 4242 4242 4242,
            any future expiry date and any CVC.
          </p>
          {workspace.role === "owner" ? (
            <BillingActions
              workspaceSlug={workspace.slug}
              plan={plan}
              configured={configured}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
