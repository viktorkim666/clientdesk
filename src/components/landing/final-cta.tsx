import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { largeButton } from "./large-button";

// Outline for keyboard focus: the base button ring is the panel's own color.
const panelFocus =
  "focus-visible:border-cta-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-cta-foreground";

export function FinalCta() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal relative overflow-hidden rounded-3xl bg-cta px-6 py-14 text-center text-cta-foreground ring-1 ring-cta-foreground/10 sm:px-12 sm:py-20">
          <div className="landing-cta-overlay" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Give every client one place to look
            </h2>
            <p className="mt-4 max-w-2xl text-cta-foreground/90">
              Set up a workspace in a minute and invite your first client.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  largeButton,
                  panelFocus,
                  "bg-cta-foreground text-cta hover:bg-cta-foreground/90",
                )}
              >
                Start free
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  largeButton,
                  panelFocus,
                  "border-cta-foreground/60 bg-transparent text-cta-foreground hover:bg-cta-foreground/10 hover:text-cta-foreground dark:border-cta-foreground/60 dark:bg-transparent dark:hover:bg-cta-foreground/10",
                )}
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
