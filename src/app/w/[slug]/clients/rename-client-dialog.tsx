"use client";

import { useActionState, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renameClientCompany, type ClientActionResult } from "./actions";

const initialState: ClientActionResult = { ok: true };

export function RenameClientDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceSlug,
  clientId,
  name,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  clientId: string;
  name: string;
  finalFocus: () => HTMLElement | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={inputRef} finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle className="leading-snug wrap-anywhere">
            Rename client
          </DialogTitle>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so a failed attempt does
            not leave its error behind for the next one. */}
        <RenameClientForm
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          clientId={clientId}
          name={name}
          inputRef={inputRef}
          onRenamed={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameClientForm({
  workspaceId,
  workspaceSlug,
  clientId,
  name,
  inputRef,
  onRenamed,
}: {
  workspaceId: string;
  workspaceSlug: string;
  clientId: string;
  name: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onRenamed: () => void;
}) {
  // The field starts from the name at open time and keeps what the user typed
  // after a failed save: React resets an uncontrolled field once a form action
  // ends, which would leave the error describing text that is no longer there.
  const [value, setValue] = useState(name);
  const errorId = useId();
  const [state, formAction, pending] = useActionState(
    async (_prev: ClientActionResult, formData: FormData) => {
      const result = await renameClientCompany(
        workspaceId,
        workspaceSlug,
        clientId,
        formData,
      );
      if (result.ok) {
        onRenamed();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rename-client-name">Client name</Label>
        <Input
          ref={inputRef}
          id="rename-client-name"
          name="name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
          autoComplete="off"
          aria-invalid={!state.ok ? true : undefined}
          aria-describedby={!state.ok ? errorId : undefined}
        />
      </div>
      {!state.ok ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending} className="max-md:h-11">
          {pending ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
