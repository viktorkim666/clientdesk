"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { roleLabel } from "@/lib/format";
import { canInviteRole } from "@/lib/permissions";
import type { WorkspaceRole } from "@/lib/validation/invitation";
import { inviteMember, type MemberActionResult } from "./actions";

const initialState: MemberActionResult = { ok: true };
const ALL_ROLES: WorkspaceRole[] = ["owner", "member", "client"];

export function InviteMemberDialog({
  workspaceId,
  workspaceSlug,
  workspaceName,
  actingRole,
  clients,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  actingRole: WorkspaceRole;
  clients: { id: string; name: string }[];
}) {
  const availableRoles = ALL_ROLES.filter((candidate) =>
    canInviteRole(actingRole, candidate),
  );
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<WorkspaceRole>(
    availableRoles[0] ?? "client",
  );
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  const [state, formAction, pending] = useActionState(
    async (_prev: MemberActionResult, formData: FormData) => {
      const result = await inviteMember(
        workspaceId,
        workspaceSlug,
        workspaceName,
        formData,
      );
      if (result.ok) {
        setOpen(false);
      }
      return result;
    },
    initialState,
  );

  if (availableRoles.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Invite</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                if (value) setRole(value);
              }}
            >
              <SelectTrigger id="role">
                <SelectValue>
                  {(value: WorkspaceRole) => roleLabel(value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((candidate) => (
                  <SelectItem
                    key={candidate}
                    value={candidate}
                    // Inviting as "client" needs a client to attach the
                    // invitee to; with none in the workspace yet, the
                    // client picker below would render with no options at
                    // all, so the option is disabled here instead of
                    // letting the user reach that dead end.
                    disabled={candidate === "client" && clients.length === 0}
                  >
                    {candidate === "client" && clients.length === 0
                      ? `${roleLabel(candidate)} (add a client first)`
                      : roleLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="role" value={role} />
          </div>
          {role === "client" ? (
            <div className="space-y-2">
              <Label htmlFor="clientId">Client</Label>
              <Select
                value={clientId}
                onValueChange={(value) => setClientId(value ?? "")}
              >
                <SelectTrigger id="clientId">
                  {/* `Select.Value` displays the raw value (here, a client
                      UUID) unless told how to format it, so without this the
                      trigger showed the id instead of the client's name. */}
                  <SelectValue placeholder="Choose a client">
                    {/* Base UI ignores `placeholder` once `children` is a
                        function (it calls the function instead), so the
                        fallback has to spell out the placeholder text
                        itself; `value` is nullable per the library's
                        contract, and is `null` before a client is
                        chosen. */}
                    {(value: string | null) =>
                      clients.find((client) => client.id === value)?.name ??
                      "Choose a client"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="clientId" value={clientId} />
            </div>
          ) : null}
          {!state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
