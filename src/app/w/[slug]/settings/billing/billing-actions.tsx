"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/billing/plan";
import { openBillingPortal, resyncBilling, startCheckout } from "./actions";

// Each button owns its own pending/error state, mirroring
// `status-control.tsx` and `file-list.tsx`: resyncing never disables the
// upgrade button, and vice versa.
export function BillingActions({
  workspaceSlug,
  plan,
  configured,
  showPrimary = true,
  showResync = true,
}: {
  workspaceSlug: string;
  plan: Plan;
  configured: boolean;
  // "Upgrade to Pro" / "Manage subscription" and "Resync" can live in
  // different cards, each rendered by its own instance.
  showPrimary?: boolean;
  showResync?: boolean;
}) {
  const [upgradePending, startUpgrade] = useTransition();
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [resyncPending, startResync] = useTransition();
  const [resyncError, setResyncError] = useState<string | null>(null);

  function handleUpgradeOrManage() {
    setUpgradeError(null);
    startUpgrade(async () => {
      // `startCheckout`/`openBillingPortal` redirect on success by throwing
      // Next's NEXT_REDIRECT error; only a failure ever returns a value
      // here, so this must not be wrapped in try/catch or the redirect
      // would be swallowed as a plain error.
      const result =
        plan === "pro"
          ? await openBillingPortal(workspaceSlug)
          : await startCheckout(workspaceSlug);
      if (!result.ok) {
        setUpgradeError(result.error);
      }
    });
  }

  function handleResync() {
    setResyncError(null);
    startResync(async () => {
      try {
        const result = await resyncBilling(workspaceSlug);
        if (!result.ok) {
          setResyncError(result.error);
        }
      } catch {
        setResyncError("Could not refresh billing status");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showPrimary ? (
          <Button
            aria-label={
              plan === "pro" ? "Manage subscription" : "Upgrade to Pro"
            }
            disabled={!configured || upgradePending}
            onClick={handleUpgradeOrManage}
          >
            {upgradePending
              ? "Redirecting…"
              : plan === "pro"
                ? "Manage subscription"
                : "Upgrade to Pro"}
          </Button>
        ) : null}
        {showResync ? (
          <Button
            aria-label="Resync"
            variant="outline"
            disabled={!configured || resyncPending}
            onClick={handleResync}
          >
            {resyncPending ? "Resyncing…" : "Resync"}
          </Button>
        ) : null}
      </div>
      {!configured && showPrimary ? (
        <p className="text-xs text-muted-foreground">
          Billing is not configured.
        </p>
      ) : null}
      {showPrimary && upgradeError ? (
        <p role="alert" className="text-sm text-destructive">
          {upgradeError}
        </p>
      ) : null}
      {showResync && resyncError ? (
        <p role="alert" className="text-sm text-destructive">
          {resyncError}
        </p>
      ) : null}
    </div>
  );
}
