import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TableCard } from "@/components/table-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanyAvatar } from "@/components/company-avatar";
import { formatDate } from "@/lib/format";
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
  const { data } = await supabase
    .from("projects")
    .select("id, name, status, created_at, clients(name)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id");
  const projects = data ?? [];

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

  const newProject = canManage ? (
    <NewProjectDialog
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
      clients={clients}
    />
  ) : null;

  const isEmpty = projects.length === 0;
  // The trigger lives in the empty state while it is the next step, so the
  // page never shows two "New project" buttons. Without clients it stays in
  // the header, disabled, and the empty state points to the clients page.
  const triggerInEmptyState = isEmpty && clients.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Every project, its client and where it stands."
        actions={triggerInEmptyState ? null : newProject}
      />
      {isEmpty ? (
        <EmptyState
          icon={FolderKanban}
          title={canManage ? "Start your first project" : "No projects yet"}
          description={
            !canManage
              ? "Projects shared with you will show up here."
              : clients.length === 0
                ? "Add a client before creating a project."
                : "Create a project to share updates and files with a client."
          }
          action={
            !canManage ? null : clients.length === 0 ? (
              <Link
                href={`/w/${workspace.slug}/clients`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Add a client first
              </Link>
            ) : (
              newProject
            )
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium whitespace-normal">
                    <Link
                      href={`/w/${workspace.slug}/projects/${project.id}`}
                      className="hover:underline"
                    >
                      {project.name}
                    </Link>
                    {project.clients ? (
                      <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                        {project.clients.name}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {project.clients ? (
                      <span className="flex items-center gap-2">
                        <CompanyAvatar size="sm" />
                        {project.clients.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(project.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
