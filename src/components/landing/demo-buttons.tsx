"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { startDemo, type DemoActionState } from "@/app/demo/actions";
import { largeButton } from "./large-button";

const initialState: DemoActionState = { ok: true };

// Outline for keyboard focus on the closing panel: the base button ring is
// the panel's own color (same as in final-cta.tsx).
const panelFocus =
  "focus-visible:border-cta-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-cta-foreground";

const styles = {
  hero: {
    agency: cn(buttonVariants({ size: "lg" }), largeButton),
    client: cn(
      buttonVariants({ variant: "outline", size: "lg" }),
      largeButton,
      "border-foreground/50 dark:border-foreground/50",
    ),
    error: "text-destructive",
  },
  panel: {
    agency: cn(
      buttonVariants({ size: "lg" }),
      largeButton,
      panelFocus,
      "bg-cta-foreground text-cta hover:bg-cta-foreground/90",
    ),
    client: cn(
      buttonVariants({ variant: "outline", size: "lg" }),
      largeButton,
      panelFocus,
      "border-cta-foreground/60 bg-transparent text-cta-foreground hover:bg-cta-foreground/10 hover:text-cta-foreground dark:border-cta-foreground/60 dark:bg-transparent dark:hover:bg-cta-foreground/10",
    ),
    // The panel is a dark indigo in both themes (--cta), so the destructive
    // token would lose contrast on it; use the panel's own text color.
    error: "font-medium text-cta-foreground underline underline-offset-4",
  },
} as const;

function DemoButton({
  role,
  label,
  className,
}: {
  role: "agency" | "client";
  label: string;
  className: string;
}) {
  const { pending, data } = useFormStatus();
  const isThisOne = pending && data?.get("role") === role;

  return (
    <button
      type="submit"
      name="role"
      value={role}
      // aria-disabled, not disabled: focus stays on the button, and the click
      // guard stops a second submit while the first is in flight.
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
      className={cn(className, "aria-disabled:opacity-60")}
    >
      {isThisOne ? "Starting demo..." : label}
    </button>
  );
}

/**
 * The two "try it" buttons. One form, two submit buttons: the clicked
 * button's `role` value picks who the visitor signs in as. Works before the
 * page hydrates too, because it is a plain form post.
 */
export function DemoButtons({ variant }: { variant: "hero" | "panel" }) {
  const [state, formAction, pending] = useActionState(startDemo, initialState);
  const style = styles[variant];

  return (
    <form action={formAction} className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <DemoButton
          role="agency"
          label="Try as agency"
          className={style.agency}
        />
        <DemoButton
          role="client"
          label="Try as client"
          className={style.client}
        />
      </div>
      <p role="status" className="sr-only">
        {pending ? "Starting demo" : ""}
      </p>
      {!state.ok && !pending ? (
        <p role="alert" className={cn("text-sm", style.error)}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
