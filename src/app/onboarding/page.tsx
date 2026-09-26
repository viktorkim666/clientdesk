import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Create your workspace</CardTitle>
            <CardDescription>
              This is where you and your clients will see project status and
              updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
