import Link from "next/link";
import { DemoButtons } from "./demo-buttons";
import { ProductPreview } from "./product-preview";

// One quiet line under the demo buttons. Log in and Sign up are in the
// header, so this is a pointer, not a third and fourth button.
const startFreeLink =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 transition-colors duration-200 hover:text-foreground sm:min-h-6";

export function Hero() {
  return (
    <section className="relative overflow-x-clip pt-16 pb-8 sm:pt-24">
      <div className="landing-glow" aria-hidden="true" />
      <div className="landing-grid" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-sm font-medium text-primary ring-1 ring-border">
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            Client portal for small agencies
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tighter text-balance sm:text-6xl">
            Every client project, in one calm place
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
            Agencies and freelancers share status, files and updates with their
            clients, so nobody has to ask where things stand.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4">
            <DemoButtons variant="hero" />
            <Link href="/signup" className={startFreeLink}>
              Or start free with your own workspace
            </Link>
          </div>
        </div>
        <div className="hero-rise mt-12 sm:mt-16 sm:pb-24">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
