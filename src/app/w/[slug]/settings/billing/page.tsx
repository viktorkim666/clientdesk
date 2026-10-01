import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { getStripe, isBillingConfigured } from "@/lib/billing/stripe";
import { syncWorkspaceBilling, toSyncSupabaseClient } from "@/lib/billing/sync";
import { FREE_CLIENT_LIMIT, planFromStatus } from "@/lib/billing/plan";
import { parseSandboxBilling } from "@/lib/demo/sandbox-billing";
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
      if (pendingRow?.stripe_customer_id) {
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

  // Which half of a demo sandbox this workspace is, if any. A security
  // invoker function, so it reads under the caller's own RLS; it runs with
  // the other two reads, not before them.
  const [{ data: billingRow }, { count: clientCount }, sandboxResult] =
    await Promise.all([
      supabase
        .from("workspace_billing")
        .select("subscription_status, current_period_end, cancel_at")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
      supabase.rpc("get_sandbox_billing", { p_workspace_id: workspace.id }),
    ]);
  const sandbox = parseSandboxBilling(sandboxResult);

  const plan = planFromStatus(billingRow?.subscription_status ?? null);
  const renewalDate =
    plan === "pro" && billingRow?.current_period_end
      ? formatDate(billingRow.current_period_end)
      : null;
  const cancelDate =
    plan === "pro" && billingRow?.cancel_at
      ? formatDate(billingRow.cancel_at)
      : null;

  const usedClients = clientCount ?? 0;
  const isOwner = workspace.role === "owner";
  // The sandbox's Pro workspace has a pinned billing row and no Stripe
  // customer, so there is nothing to manage or resync there.
  const isSandboxPro = sandbox?.kind === "pro";
  const includes =
    plan === "pro"
      ? ["Updates, files and comments", "AI update drafts"]
      : [`Up to ${FREE_CLIENT_LIMIT} clients`, "Updates, files and comments"];
  const proAdds = ["Unlimited clients", "AI update drafts"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your plan and what it includes."
      />
      <div
        className={
          plan === "free" ? "grid gap-6 md:grid-cols-2" : "grid max-w-2xl"
        }
      >
        <Card>
          <CardHeader>
            <CardTitle render={<h2 />} className="flex items-center gap-2">
              Plan
              <Badge variant={plan === "pro" ? "default" : "secondary"}>
                {plan === "pro" ? "Pro" : "Free"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan === "free" ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {usedClients} / {FREE_CLIENT_LIMIT} clients used
                </p>
                <Progress
                  value={Math.min(usedClients, FREE_CLIENT_LIMIT)}
                  max={FREE_CLIENT_LIMIT}
                  aria-label="Clients used on the Free plan"
                />
              </div>
            ) : (
              <p className="text-sm">Unlimited clients</p>
            )}
            <FeatureList items={includes} />
            {cancelDate ? (
              <p className="text-sm text-muted-foreground">
                Cancels on {cancelDate}
              </p>
            ) : renewalDate ? (
              <p className="text-sm text-muted-foreground">
                Renews on {renewalDate}
              </p>
            ) : null}
          </CardContent>
          {isOwner && !isSandboxPro ? (
            <CardFooter>
              <BillingActions
                workspaceSlug={workspace.slug}
                plan={plan}
                configured={configured}
                showPrimary={plan === "pro"}
              />
            </CardFooter>
          ) : null}
        </Card>
        {plan === "free" ? (
          <Card>
            <CardHeader>
              <CardTitle render={<h2 />}>Pro</CardTitle>
              <CardDescription>
                For agencies with a growing roster.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <FeatureList items={proAdds} />
            </CardContent>
            <CardFooter>
              {isOwner ? (
                <BillingActions
                  workspaceSlug={workspace.slug}
                  plan={plan}
                  configured={configured}
                  showResync={false}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Only the workspace owner can change the plan.
                </p>
              )}
            </CardFooter>
          </Card>
        ) : null}
      </div>
      {sandbox?.kind === "pro" ? (
        <Card className="max-w-2xl bg-muted/50">
          <CardHeader>
            <CardTitle render={<h2 />}>Demo workspace</CardTitle>
            <CardDescription>
              This demo workspace is on Pro, so every feature is unlocked.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {sandbox.freeSlug ? (
              <p>
                To try checkout, open{" "}
                <Link
                  href={`/w/${sandbox.freeSlug}/settings/billing`}
                  className="inline-flex items-center font-medium text-foreground underline underline-offset-4 max-sm:min-h-11"
                >
                  Northwind Labs
                </Link>
                , the Free workspace in this demo.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card className="max-w-2xl bg-muted/50">
        <CardHeader>
          <CardTitle render={<h2 />}>Test mode</CardTitle>
          <CardDescription>
            Billing runs in Stripe test mode. Use test card 4242 4242 4242 4242,
            any future expiry date and any CVC.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2">
          <Check aria-hidden="true" className="size-4 text-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}
