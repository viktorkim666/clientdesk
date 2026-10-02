"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientDeleteBlockers } from "./client-delete-state";
import {
  BlockedClientDialog,
  DeleteClientDialog,
} from "./delete-client-dialog";
import { NEW_CLIENT_TRIGGER_ID } from "./new-client-dialog";
import { RenameClientDialog } from "./rename-client-dialog";

type OpenDialog = "rename" | "delete" | "blocked" | null;

// One menu per row. The dialogs are siblings of the menu, not children of its
// items: a menu item unmounts with the menu, and a dialog opened from it would
// go with it.
export function ClientRowActions({
  workspaceId,
  workspaceSlug,
  viewerRole,
  client,
}: {
  workspaceId: string;
  workspaceSlug: string;
  viewerRole: "owner" | "member";
  client: {
    id: string;
    name: string;
    projectCount: number;
    peopleCount: number;
    pendingInvitations: number;
  };
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);

  const blockers = clientDeleteBlockers({
    name: client.name,
    projectCount: client.projectCount,
    peopleCount: client.peopleCount,
    viewerRole,
  });

  // When the row is gone, the row's button is too: focus goes to New client.
  // The menu closes by returning focus to its trigger, so a dialog opened from
  // it names its own return target instead of relying on that.
  function returnFocus(): HTMLElement | null {
    return deletedRef.current
      ? document.getElementById(NEW_CLIENT_TRIGGER_ID)
      : triggerRef.current;
  }

  // After the last client is deleted, New client only exists once the page
  // re-renders with the empty state, which is also when this row unmounts.
  useEffect(
    () => () => {
      if (deletedRef.current) {
        setTimeout(
          () => document.getElementById(NEW_CLIENT_TRIGGER_ID)?.focus(),
          0,
        );
      }
    },
    [],
  );

  function closeDialog(open: boolean) {
    if (!open) {
      setDialog(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              variant="ghost"
              size="icon-sm"
              className="max-md:size-11"
              aria-label={`Actions for ${client.name}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-32">
          <DropdownMenuItem
            className="max-md:min-h-11"
            onClick={() => setDialog("rename")}
          >
            <Pencil aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            // The plain destructive text misses 4.5:1 on its own focus tint
            // in light mode; this is the tint-safe color the destructive
            // Button uses.
            className="data-[variant=destructive]:text-destructive-on-tint data-[variant=destructive]:focus:text-destructive-on-tint max-md:min-h-11"
            onClick={() =>
              setDialog(blockers.length > 0 ? "blocked" : "delete")
            }
          >
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameClientDialog
        open={dialog === "rename"}
        onOpenChange={closeDialog}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        clientId={client.id}
        name={client.name}
        finalFocus={returnFocus}
      />
      <DeleteClientDialog
        open={dialog === "delete"}
        onOpenChange={closeDialog}
        onDeleted={() => {
          deletedRef.current = true;
          setDialog(null);
        }}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        clientId={client.id}
        name={client.name}
        pendingInvitations={client.pendingInvitations}
        finalFocus={returnFocus}
      />
      <BlockedClientDialog
        open={dialog === "blocked"}
        onOpenChange={closeDialog}
        workspaceSlug={workspaceSlug}
        name={client.name}
        blockers={blockers}
        finalFocus={returnFocus}
      />
    </>
  );
}
