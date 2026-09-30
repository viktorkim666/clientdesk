import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";
import { PageBackdrop } from "@/components/page-backdrop";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login?next=/onboarding");
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(slug)")
    .eq("user_id", claims.claims.sub)
    .limit(1)
    .maybeSingle();

  const existingSlug = membership?.workspaces?.slug;
  if (existingSlug) {
    redirect(`/w/${existingSlug}`);
  }

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <PageBackdrop />
      <OutsideWorkspaceHeader />
      <main className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle render={<h1 />}>Create your workspace</CardTitle>
            <CardDescription>
              This is where you and your clients will see project status and
              updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
