"use client";

import { useActionState, useId, useState } from "react";
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
import { InviteLinkPanel } from "./invite-link-panel";

const initialState: MemberActionResult = { ok: true };
const ALL_ROLES: WorkspaceRole[] = ["owner", "member", "client"];

export function InviteMemberDialog({
  workspaceId,
  workspaceSlug,
  workspaceName,
  actingRole,
  clients,
  isDemo,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  actingRole: WorkspaceRole;
  clients: { id: string; name: string }[];
  isDemo: boolean;
}) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  // Bumped on every open, so the body remounts and starts from an empty form.
  const [openCount, setOpenCount] = useState(0);

  if (ALL_ROLES.every((candidate) => !canInviteRole(actingRole, candidate))) {
    return null;
  }

  if (isDemo) {
    // aria-disabled, not disabled: the button stays focusable, so a keyboard
    // or screen reader user reaches it and hears the note it points to.
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Button
          variant="outline"
          size="sm"
          aria-disabled="true"
          aria-describedby={noteId}
          onClick={(event) => event.preventDefault()}
          className="aria-disabled:opacity-50"
        >
          Invite
        </Button>
        <p id={noteId} className="text-xs text-muted-foreground">
          Invites are turned off in the demo workspace.
        </p>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((count) => count + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Invite</DialogTrigger>
      <DialogContent>
        {/* Base UI keeps the popup mounted while it animates out. The body
            stays visible for the fade, but once closed it is inert and hidden
            from assistive tech, so the old form or link cannot be reached or
            found. `contents` keeps the wrapper out of the popup's layout. */}
        <div className="contents" inert={!open} aria-hidden={!open}>
          <InviteDialogBody
            key={openCount}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            workspaceName={workspaceName}
            actingRole={actingRole}
            clients={clients}
            onClose={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialogBody({
  workspaceId,
  workspaceSlug,
  workspaceName,
  actingRole,
  clients,
  onClose,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  actingRole: WorkspaceRole;
  clients: { id: string; name: string }[];
  onClose: () => void;
}) {
  const availableRoles = ALL_ROLES.filter((candidate) =>
    canInviteRole(actingRole, candidate),
  );
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
      // With an email provider the invitation is on its way and the dialog is
      // done; without one the link view below takes over.
      if (result.ok && !result.inviteUrl) onClose();
      return result;
    },
    initialState,
  );

  // Set when the invitation was created but no provider emailed it, so the
  // owner has to hand the link over.
  const inviteUrl = state.ok ? state.inviteUrl : undefined;

  if (inviteUrl) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Invitation ready</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <InviteLinkPanel inviteUrl={inviteUrl} />
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </div>
      </>
    );
  }

  return (
    <>
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
    </>
  );
}
