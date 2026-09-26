import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Clientdesk</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        A client portal for small agencies: the agency and its clients see
        project status, files and updates in one place.
      </p>
      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/login" />}>
          Log in
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/signup" />}
        >
          Sign up
        </Button>
      </div>
    </div>
  );
}
