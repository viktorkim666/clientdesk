"use client";

import { UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { roleLabel } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canChangeRole, canRemoveMember } from "@/lib/permissions";
import { applyOptimisticAction } from "@/lib/optimistic-action";
import {
  workspaceRoleSchema,
  type WorkspaceRole,
} from "@/lib/validation/invitation";
import { changeMemberRole, removeMember } from "./actions";

export type MemberRowData = {
  userId: string;
  role: WorkspaceRole;
  fullName: string;
  clientName: string | null;
};

type RowError = { source: "role" | "remove"; message: string } | null;

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
  // Controlled, not `defaultValue`: on a failed change the trigger is
  // resynced to `member.role` below, matching the pattern in
  // `status-control.tsx` (an uncontrolled `Select` can't be corrected once
  // the server rejects the change the user picked).
  const [role, setRole] = useState(member.role);
  // `member.role` is only the value from the render that mounted this row;
  // after a revalidation (e.g. another owner changed this member's role)
  // the parent re-renders with a new prop, but `useState`'s initial value is
  // never re-read. Comparing against the last prop we've seen and adjusting
  // state during render is the supported way to resync to it. While our own
  // change is in flight (`pending`), the server can't yet reflect it, so an
  // unrelated prop update during that window is left alone rather than
  // clobbering the optimistic value.
  const [syncedRole, setSyncedRole] = useState(member.role);
  if (!pending && member.role !== syncedRole) {
    setSyncedRole(member.role);
    setRole(member.role);
  }
  const [error, setError] = useState<RowError>(null);
  const showRoleSelect =
    canChangeRole(actingRole) && member.role !== "client" && !isLastOwner;
  const showRemove = canRemoveMember(actingRole) && !isLastOwner;
  const roleErrorId = `member-role-error-${member.userId}`;
  const removeErrorId = `member-remove-error-${member.userId}`;

  function handleRoleChange(value: string | null) {
    if (!value) return;
    const parsed = workspaceRoleSchema.safeParse(value);
    if (!parsed.success) return; // The select only ever offers valid roles.
    setError(null);
    const previousRole = role;
    setRole(parsed.data);
    startTransition(() =>
      applyOptimisticAction({
        action: () =>
          changeMemberRole(
            workspaceId,
            workspaceSlug,
            member.userId,
            parsed.data,
          ),
        revert: () => setRole(previousRole),
        onError: (message) => setError({ source: "role", message }),
        fallbackMessage: "Could not change this member's role",
      }),
    );
  }

  function handleRemove() {
    setError(null);
    startTransition(() =>
      applyOptimisticAction({
        action: () => removeMember(workspaceId, workspaceSlug, member.userId),
        onError: (message) => setError({ source: "remove", message }),
        fallbackMessage: "Could not remove this member",
      }),
    );
  }

  const roleError = error?.source === "role" ? error.message : null;
  const removeError = error?.source === "remove" ? error.message : null;

  return (
    <TableRow>
      <TableCell className="w-full max-w-0 font-medium sm:w-auto sm:max-w-none">
        <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
          <UserAvatar name={member.fullName} size="sm" className="row-span-2" />
          <span className="truncate">{member.fullName}</span>
          {member.clientName ? (
            <span className="truncate text-xs font-normal text-muted-foreground sm:hidden">
              {member.clientName}
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell>
        {showRoleSelect ? (
          <div className="flex flex-col gap-1">
            <Select
              value={role}
              disabled={pending}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger
                className="w-24 max-md:data-[size=default]:h-11 sm:w-28"
                aria-label={`Role for ${member.fullName}`}
                aria-invalid={roleError !== null}
                aria-describedby={roleError !== null ? roleErrorId : undefined}
              >
                {/* Without a formatter the trigger shows the raw enum value
                    ("member") until the items mount. */}
                <SelectValue>
                  {(value: WorkspaceRole) => roleLabel(value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{roleLabel("owner")}</SelectItem>
                <SelectItem value="member">{roleLabel("member")}</SelectItem>
              </SelectContent>
            </Select>
            {roleError ? (
              <p
                id={roleErrorId}
                role="alert"
                className="text-xs text-destructive"
              >
                {roleError}
              </p>
            ) : null}
          </div>
        ) : (
          <RoleBadge role={member.role} />
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {member.clientName ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {showRemove ? (
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="max-md:h-11 max-sm:w-11"
              aria-label={`Remove ${member.fullName}`}
              disabled={pending}
              onClick={handleRemove}
              aria-invalid={removeError !== null}
              aria-describedby={
                removeError !== null ? removeErrorId : undefined
              }
            >
              {/* Icon only below sm, so the name column keeps room for a full
                  name on a phone. */}
              <UserMinus aria-hidden="true" className="sm:hidden" />
              <span className="max-sm:sr-only">Remove</span>
            </Button>
            {removeError ? (
              <p
                id={removeErrorId}
                role="alert"
                className="text-xs text-destructive"
              >
                {removeError}
              </p>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
