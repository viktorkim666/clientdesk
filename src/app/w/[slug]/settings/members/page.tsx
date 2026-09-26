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

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, role, profiles(full_name), clients(name)")
    .eq("workspace_id", workspace.id);

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .order("name", { ascending: true });

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at")
    .eq("workspace_id", workspace.id)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  const memberList: MemberRowData[] = (members ?? []).map((member) => ({
    userId: member.user_id,
    role: member.role,
    fullName: member.profiles?.full_name ?? "Unnamed",
    clientName: member.clients?.name ?? null,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Members</h1>
        <InviteMemberDialog
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          workspaceName={workspace.name}
          actingRole={workspace.role}
          clients={clients ?? []}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Pending invitations</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(invitations ?? []).map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>{invitation.role}</TableCell>
                <TableCell>
                  {new Date(invitation.expires_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {(invitations ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No pending invitations.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
