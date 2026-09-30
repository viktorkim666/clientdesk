import Link from "next/link";
import { cn } from "cn";
import { DemoButtons } from "./demo-buttons";

// Outline for keyboard focus: the base button ring is the panel's own color.
const panelFocus =
  "focus-visible:border-cta-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-cta-foreground";

// One quiet line under the demo buttons, like the hero's.
const startFreeLink = cn(
  panelFocus,
  "inline-flex min-h-11 items-center rounded-sm text-sm text-cta-foreground/90 underline underline-offset-4 transition-colors duration-200 hover:text-cta-foreground sm:min-h-6",
);

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
            <div className="mt-8 flex flex-col items-center gap-4">
              <DemoButtons variant="panel" />
              <Link href="/signup" className={startFreeLink}>
                Or start free with your own workspace
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
