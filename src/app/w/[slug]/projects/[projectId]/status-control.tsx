"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectStatus } from "@/lib/validation/project";
import { changeStatus } from "./actions";

const STATUSES: ProjectStatus[] = ["active", "on_hold", "done"];

export function StatusControl({
  workspaceId,
  workspaceSlug,
  projectId,
  status: serverStatus,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  status: ProjectStatus;
}) {
  // Controlled, not `defaultValue`: on a failed change the trigger is
  // resynced to `status` below, and a controlled `Select` is also what Base
  // UI expects when the value can change after the first render (an
  // uncontrolled one warns if its default value state changes later).
  const [status, setStatus] = useState(serverStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleValueChange(value: string | null) {
    if (!value) return;
    setError(null);
    const previousStatus = status;
    // Optimistic: the trigger shows the new status right away and only
    // falls back to `previousStatus` if the server rejects the change.
    setStatus(value as ProjectStatus);
    startTransition(async () => {
      try {
        const result = await changeStatus(
          workspaceId,
          workspaceSlug,
          projectId,
          value,
        );
        if (!result.ok) {
          setStatus(previousStatus);
          setError(result.error);
        }
      } catch {
        // The Server Action call itself failed (e.g. a network error), so
        // there is no `ActionResult` to read; the fallback resyncs the
        // trigger the same way an `{ ok: false }` result does.
        setStatus(previousStatus);
        setError("Could not change the project's status");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={status}
        disabled={pending}
        onValueChange={handleValueChange}
      >
        <SelectTrigger aria-label="Project status" className="w-32">
          {/* `Select.Value` displays the raw value unless told how to format
              it (see https://base-ui.com/react/components/select#value):
              without this, picking "on_hold" showed the trigger as literally
              "on_hold" instead of "on hold". */}
          <SelectValue>
            {(value: ProjectStatus) => value.replace("_", " ")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {candidate.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
