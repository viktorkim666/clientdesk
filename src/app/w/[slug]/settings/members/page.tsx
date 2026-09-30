import { Mail } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { TableCard } from "@/components/table-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isCurrentWorkspaceDemo } from "@/lib/demo/current-sandbox";
import { formatDate, formatExpiry } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { isLastOwner } from "@/lib/permissions";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow, type MemberRowData } from "./member-row";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const [{ data: members }, { data: clients }, { data: invitations }, isDemo] =
    await Promise.all([
      supabase
        .from("workspace_members")
        .select("user_id, role, profiles(full_name), clients(name)")
        .eq("workspace_id", workspace.id),
      supabase
        .from("clients")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .order("name", { ascending: true }),
      supabase
        .from("invitations")
        .select("id, email, role, expires_at")
        .eq("workspace_id", workspace.id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
      isCurrentWorkspaceDemo(supabase, workspace.id),
    ]);

  const now = new Date();

  const memberList: MemberRowData[] = (members ?? []).map((member) => ({
    userId: member.user_id,
    role: member.role,
    fullName: member.profiles?.full_name ?? "Unnamed",
    clientName: member.clients?.name ?? null,
  }));

  const pendingInvitations = invitations ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Members"
        description="People who can work in this workspace."
        actions={
          <InviteMemberDialog
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
            workspaceName={workspace.name}
            actingRole={workspace.role}
            clients={clients ?? []}
            isDemo={isDemo}
          />
        }
      />

      <TableCard>
        <Table aria-label="Members">
          {/* Below sm rows are stacked grids, so the column headers no
              longer line up; they stay available to assistive tech, and the
              explicit roles keep table semantics where display:grid drops
              them. */}
          <TableHeader className="max-sm:sr-only" role="rowgroup">
            <TableRow role="row">
              <TableHead role="columnheader">Name</TableHead>
              <TableHead role="columnheader">Role</TableHead>
              <TableHead role="columnheader" className="hidden sm:table-cell">
                Client
              </TableHead>
              <TableHead role="columnheader" className="text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody role="rowgroup">
            {memberList.map((member) => (
              <MemberRow
                key={member.userId}
                workspaceId={workspace.id}
                workspaceSlug={workspace.slug}
                actingRole={workspace.role}
                member={member}
                isLastOwner={isLastOwner(
                  memberList.map((entry) => ({
                    userId: entry.userId,
                    role: entry.role,
                  })),
                  member.userId,
                )}
              />
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <section
        aria-labelledby="pending-invitations-heading"
        className="space-y-3"
      >
        <h2 id="pending-invitations-heading" className="text-lg font-semibold">
          Pending invitations
        </h2>
        {pendingInvitations.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No pending invitations"
            description="Invitations you send will wait here until they are accepted."
          />
        ) : (
          <TableCard>
            <Table aria-label="Pending invitations">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Expires
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium wrap-anywhere whitespace-normal">
                      {invitation.email}
                      <time
                        dateTime={invitation.expires_at}
                        title={formatDate(invitation.expires_at)}
                        className="block text-xs font-normal text-muted-foreground sm:hidden"
                      >
                        {formatExpiry(invitation.expires_at, now)}
                      </time>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={invitation.role} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      <time
                        dateTime={invitation.expires_at}
                        title={formatDate(invitation.expires_at)}
                      >
                        {formatExpiry(invitation.expires_at, now)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>
    </div>
  );
}
