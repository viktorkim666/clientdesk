"use client";

import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { switchDemoRole, type DemoActionState } from "@/app/demo/actions";

const initialState: DemoActionState = { ok: true };

function SwitchButton({
  label,
  short,
  pending,
}: {
  label: string;
  short: string;
  pending: boolean;
}) {
  // aria-disabled, not disabled: a disabled button drops keyboard focus, and
  // the click guard stops a second submit while the first is in flight.
  return (
    <Button
      type="submit"
      variant="outline"
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className="aria-disabled:opacity-50"
    >
      {pending ? (
        "Switching..."
      ) : (
        <>
          <span className="sm:hidden">
            <span className="sr-only">Switch to </span>
            {short}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </>
      )}
    </Button>
  );
}

/**
 * The strip shown at the top of every page inside a demo sandbox: it says
 * this is a demo, who the visitor is signed in as, when the copy goes away,
 * and offers the switch to the other role. On a phone it is one short line
 * with a small switch button beside it; from `sm` up it spells everything out.
 */
export function DemoBanner({
  label,
  shortLabel,
  switchLabel,
  switchShortLabel,
}: {
  label: string;
  shortLabel: string;
  switchLabel: string | null;
  switchShortLabel: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    switchDemoRole,
    initialState,
  );

  return (
    <section
      aria-label="Demo workspace"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-muted px-4 py-1.5 text-sm text-foreground sm:py-3 md:px-8"
    >
      <div className="min-w-0 flex-1">
        <p className="break-words">
          <span className="font-semibold">
            <span className="sm:hidden">Demo</span>
            <span className="hidden sm:inline">Demo workspace</span>
          </span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">. </span>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="text-foreground/70">Resets within 24 hours</p>
      </div>
      {switchLabel && switchShortLabel ? (
        <form action={formAction} className="shrink-0">
          <SwitchButton
            label={switchLabel}
            short={switchShortLabel}
            pending={pending}
          />
        </form>
      ) : null}
      <p role="status" className="sr-only">
        {pending ? "Switching view" : ""}
      </p>
      {!state.ok && !pending ? (
        <p role="alert" className="flex basis-full items-start gap-1.5">
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
