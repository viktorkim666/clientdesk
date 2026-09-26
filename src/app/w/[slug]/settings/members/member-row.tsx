"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canChangeRole, canRemoveMember } from "@/lib/permissions";
import type { WorkspaceRole } from "@/lib/validation/invitation";
import { changeMemberRole, removeMember } from "./actions";

export type MemberRowData = {
  userId: string;
  role: WorkspaceRole;
  fullName: string;
  clientName: string | null;
};

export function MemberRow({
  workspaceId,
  workspaceSlug,
  actingRole,
  member,
  isLastOwner,
}: {
  workspaceId: string;
  workspaceSlug: string;
  actingRole: WorkspaceRole;
  member: MemberRowData;
  isLastOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const showRoleSelect =
    canChangeRole(actingRole) && member.role !== "client" && !isLastOwner;
  const showRemove = canRemoveMember(actingRole) && !isLastOwner;

  return (
    <TableRow>
      <TableCell>{member.fullName}</TableCell>
      <TableCell>
        {showRoleSelect ? (
          <Select
            defaultValue={member.role}
            disabled={pending}
            onValueChange={(value) => {
              if (!value) return;
              startTransition(() => {
                void changeMemberRole(
                  workspaceId,
                  workspaceSlug,
                  member.userId,
                  value as WorkspaceRole,
                );
              });
            }}
          >
            <SelectTrigger
              className="w-28"
              aria-label={`Role for ${member.fullName}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">owner</SelectItem>
              <SelectItem value="member">member</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          member.role
        )}
      </TableCell>
      <TableCell>{member.clientName ?? "—"}</TableCell>
      <TableCell className="text-right">
        {showRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void removeMember(workspaceId, workspaceSlug, member.userId);
              })
            }
          >
            Remove
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
