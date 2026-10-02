import Link from "next/link";
import { TriangleAlert, Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableCard } from "@/components/table-card";
import { Progress } from "@/components/ui/progress";
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
import { FREE_CLIENT_LIMIT, planFromStatus } from "@/lib/billing/plan";
import { pendingInvitationCount } from "./client-delete-state";
import { ClientRowActions } from "./client-row-actions";
import { NewClientDialog } from "./new-client-dialog";

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const [clientsResult, billingResult] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, created_at, projects(count), workspace_members(count), invitations(accepted_at, expires_at)",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_billing")
      .select("subscription_status")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (billingResult.error) throw billingResult.error;

  const clients = clientsResult.data ?? [];
  const viewerRole =
    workspace.role === "owner" || workspace.role === "member"
      ? workspace.role
      : null;
  const canManage = viewerRole !== null;
  const now = new Date();
  const clientCount = clients.length;
  const plan = planFromStatus(billingResult.data?.subscription_status ?? null);
  const atFreeLimit = plan === "free" && clientCount >= FREE_CLIENT_LIMIT;

  const newClient = canManage ? (
    <NewClientDialog
      workspaceId={workspace.id}
      workspaceSlug={workspace.slug}
    />
  ) : null;
  const isEmpty = clientCount === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="The companies you work for."
        actions={isEmpty ? null : newClient}
      />
      {plan === "free" ? (
        <div
          data-slot="usage-callout"
          className="flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3"
        >
          <div className="space-y-2">
            <p className="text-sm">
              {clientCount} / {FREE_CLIENT_LIMIT} clients used.
            </p>
            <Progress
              value={Math.min(clientCount, FREE_CLIENT_LIMIT)}
              max={FREE_CLIENT_LIMIT}
              aria-label="Clients used on the Free plan"
              className="w-40 max-w-full"
            />
          </div>
          {atFreeLimit ? (
            <div className="flex items-center gap-2 text-sm">
              <TriangleAlert
                aria-hidden="true"
                className="size-4 shrink-0 text-warning-foreground"
              />
              <span className="font-medium">Limit reached</span>
              {canManage ? (
                <Link
                  href={`/w/${workspace.slug}/settings/billing`}
                  className="underline underline-offset-4"
                >
                  Upgrade to Pro
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {isEmpty ? (
        <EmptyState
          icon={Users}
          title={canManage ? "Add your first client" : "No clients yet"}
          description={
            canManage
              ? "Clients are the companies you create projects for."
              : "Clients you work with will show up here."
          }
          action={newClient}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="hidden sm:table-cell">Added</TableHead>
                {viewerRole ? (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium wrap-anywhere whitespace-normal">
                    <span className="flex items-center gap-2">
                      <CompanyAvatar size="sm" className="shrink-0" />
                      {client.name}
                    </span>
                  </TableCell>
                  <TableCell>{client.projects[0]?.count ?? 0}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(client.created_at)}
                  </TableCell>
                  {viewerRole ? (
                    <TableCell className="text-right">
                      <ClientRowActions
                        workspaceId={workspace.id}
                        workspaceSlug={workspace.slug}
                        viewerRole={viewerRole}
                        client={{
                          id: client.id,
                          name: client.name,
                          projectCount: client.projects[0]?.count ?? 0,
                          peopleCount: client.workspace_members[0]?.count ?? 0,
                          pendingInvitations: pendingInvitationCount(
                            client.invitations,
                            now,
                          ),
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
