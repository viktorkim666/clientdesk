"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_MS = 2000;

type CopyStatus = "idle" | "copied" | "failed";

/**
 * Shown in place of the invite form when the invitation exists but no email
 * provider sent it, so the owner has to pass the link on themselves.
 */
export function InviteLinkPanel({ inviteUrl }: { inviteUrl: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // The panel replaces the form, so focus would otherwise be lost with it.
  useEffect(() => {
    inputRef.current?.focus();
    return () => clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    // Clearing first and setting after the async write makes the status
    // region change on every click, so a repeated copy is announced again.
    clearTimeout(resetTimer.current);
    setStatus("idle");
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    resetTimer.current = setTimeout(() => setStatus("idle"), STATUS_MS);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        No email was sent, so copy this link and send it to the invitee
        yourself.
      </p>
      <div className="space-y-2">
        <Label htmlFor="invite-link">Invite link</Label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            id="invite-link"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 max-sm:h-11"
          />
          <Button
            type="button"
            variant="outline"
            aria-label="Copy invite link"
            onClick={() => void copy()}
            className="shrink-0"
          >
            Copy
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm">
          {status === "copied" ? "Copied" : null}
          {status === "failed"
            ? "Could not copy. Select the link and copy it by hand."
            : null}
        </p>
      </div>
    </div>
  );
}
