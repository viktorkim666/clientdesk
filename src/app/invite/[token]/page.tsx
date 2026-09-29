import Link from "next/link";
import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";
import { Button } from "@/components/ui/button";
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
                <Button
                  className="flex-1"
                  nativeButton={false}
                  render={<Link href={`/login?next=/invite/${token}`} />}
                >
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  nativeButton={false}
                  render={<Link href={`/signup?next=/invite/${token}`} />}
                >
                  Sign up
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
