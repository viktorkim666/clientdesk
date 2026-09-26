import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const { data: projects } = await supabase
    .from("projects")
    .select("id, status")
    .eq("workspace_id", workspace.id);

  const activeCount = (projects ?? []).filter(
    (project) => project.status === "active",
  ).length;
  const totalCount = (projects ?? []).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{workspace.name}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active projects</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            {activeCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total projects</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{totalCount}</CardContent>
        </Card>
      </div>
    </div>
  );
}
