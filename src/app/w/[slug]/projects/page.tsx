import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { NewProjectDialog } from "./new-project-dialog";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  // RLS already scopes this to the caller's own client when they are a
  // client; staff see every project. The UI only adds the "New project"
  // control for staff.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, clients(name)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true });

  const canManage = workspace.role === "owner" || workspace.role === "member";

  let clients: { id: string; name: string }[] = [];
  if (canManage) {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("name", { ascending: true });
    clients = data ?? [];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {canManage ? (
          <NewProjectDialog
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            clients={clients}
          />
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(projects ?? []).map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <Link
                  href={`/w/${workspace.slug}/projects/${project.id}`}
                  className="hover:underline"
                >
                  {project.name}
                </Link>
              </TableCell>
              <TableCell>{project.clients?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    project.status === "active" ? "default" : "secondary"
                  }
                >
                  {project.status.replace("_", " ")}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {(projects ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                No projects yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
