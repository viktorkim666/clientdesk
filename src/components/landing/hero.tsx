import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { largeButton } from "./large-button";
import { ProductPreview } from "./product-preview";

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
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "lg" }), largeButton)}
            >
              Start free
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                largeButton,
                "border-foreground/50 dark:border-foreground/50",
              )}
            >
              Log in
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
