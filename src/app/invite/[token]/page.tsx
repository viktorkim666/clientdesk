import Link from "next/link";
import { cn } from "cn";
import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvitationForm } from "./accept-invitation-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <OutsideWorkspaceHeader />
      <main className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle render={<h1 />}>Accept invitation</CardTitle>
            <CardDescription>
              {claims
                ? "Accept this invitation to join the workspace."
                : "Sign in or create an account to accept this invitation."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {claims ? (
              <AcceptInvitationForm token={token} />
            ) : (
              <div className="flex gap-2">
                <Link
                  href={`/login?next=/invite/${token}`}
                  className={cn(buttonVariants(), "flex-1")}
                >
                  Sign in
                </Link>
                <Link
                  href={`/signup?next=/invite/${token}`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "flex-1",
                  )}
                >
                  Sign up
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
