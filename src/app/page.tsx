import { redirect } from "next/navigation";
import { FinalCta } from "@/components/landing/final-cta";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthRedirect } from "@/lib/auth/post-login-redirect";

export default async function Home() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (claims) {
    const redirectTo = await resolvePostAuthRedirect(
      supabase,
      claims.claims.sub,
      null,
    );
    redirect(redirectTo);
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Hero />
        <Features />
        <HowItWorks />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
