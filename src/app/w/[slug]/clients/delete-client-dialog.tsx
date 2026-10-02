"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteClientCompany } from "./actions";
import type { ClientDeleteBlocker } from "./client-delete-state";

const DELETE_FAILED = "Could not delete this client";

export function DeleteClientDialog({
  open,
  onOpenChange,
  onDeleted,
  workspaceId,
  workspaceSlug,
  clientId,
  name,
  pendingInvitations,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  workspaceId: string;
  workspaceSlug: string;
  clientId: string;
  name: string;
  pendingInvitations: number;
  finalFocus: () => HTMLElement | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Both buttons are disabled while the delete runs, so after a failure focus
  // can only return once the transition has ended.
  useEffect(() => {
    if (!pending && error) {
      cancelRef.current?.focus();
    }
  }, [pending, error]);

  // A close request (Escape, Cancel) is ignored while the delete runs: the
  // dialog is the only place the user sees what is happening.
  function handleOpenChange(next: boolean) {
    if (pending) {
      return;
    }
    if (!next) {
      setError(null);
    }
    onOpenChange(next);
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteClientCompany(
          workspaceId,
          workspaceSlug,
          clientId,
        );
        if (result.ok) {
          onDeleted();
        } else {
          setError(result.error);
        }
      } catch {
        setError(DELETE_FAILED);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="wrap-anywhere">
            Delete {name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The client is removed from this workspace and can&apos;t be
            restored.
            {pendingInvitations > 0
              ? pendingInvitations === 1
                ? " 1 pending invitation will stop working."
                : ` ${pendingInvitations} pending invitations will stop working.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            ref={cancelRef}
            disabled={pending}
            className="max-md:h-11"
          >
            Cancel
          </AlertDialogCancel>
          {/* A solid fill: the soft destructive tint misses 4.5:1 for this
              text size in light mode. */}
          <AlertDialogAction
            variant="destructive"
            className="bg-destructive text-white hover:bg-destructive/90 max-md:h-11 dark:bg-destructive dark:text-background dark:hover:bg-destructive/90"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "Deleting..." : "Delete client"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Explains why a client with projects or people stays, and where to go first.
export function BlockedClientDialog({
  open,
  onOpenChange,
  workspaceSlug,
  name,
  blockers,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  name: string;
  blockers: ClientDeleteBlocker[];
  finalFocus: () => HTMLElement | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The footer's Close button is the one way out; the corner button
          would be a second "Close" with the same name. */}
      <DialogContent showCloseButton={false} finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle className="leading-snug wrap-anywhere">
            Can&apos;t delete {name}
          </DialogTitle>
        </DialogHeader>
        {/* The reasons are the dialog's description, so a screen reader reads
            them with the title. A div, because the reasons are paragraphs. */}
        <DialogDescription
          render={<div />}
          className="space-y-3 wrap-anywhere text-popover-foreground"
        >
          {blockers.map((blocker) => (
            <p key={blocker.kind}>
              {blocker.text}
              {blocker.link ? (
                <>
                  {" "}
                  <Link
                    href={`/w/${workspaceSlug}/${
                      blocker.link.page === "projects"
                        ? "projects"
                        : "settings/members"
                    }`}
                    className="inline-flex items-center font-medium underline underline-offset-4 max-md:min-h-11"
                  >
                    {blocker.link.label}
                  </Link>
                </>
              ) : null}
            </p>
          ))}
        </DialogDescription>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" className="max-md:h-11" />}
          >
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
