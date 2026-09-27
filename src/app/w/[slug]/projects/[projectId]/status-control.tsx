"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  projectStatusSchema,
  type ProjectStatus,
} from "@/lib/validation/project";
import { changeStatus } from "./actions";

const STATUSES: ProjectStatus[] = ["active", "on_hold", "done"];
const STATUS_ERROR_ID = "project-status-error";

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
  // `serverStatus` is only the value from the render that mounted this
  // component; after a revalidation (e.g. another owner changed the status)
  // the parent re-renders with a new prop, but `useState`'s initial value is
  // never re-read. Comparing against the last prop we've seen and adjusting
  // state during render is the supported way to resync to it. While our own
  // change is in flight (`pending`), the server can't yet reflect it, so an
  // unrelated prop update during that window is left alone rather than
  // clobbering the optimistic value.
  const [syncedStatus, setSyncedStatus] = useState(serverStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!pending && serverStatus !== syncedStatus) {
    setSyncedStatus(serverStatus);
    setStatus(serverStatus);
  }

  function handleValueChange(value: string | null) {
    if (!value) return;
    const parsed = projectStatusSchema.safeParse(value);
    if (!parsed.success) return; // The select only ever offers valid statuses.
    setError(null);
    const previousStatus = status;
    // Optimistic: the trigger shows the new status right away and only
    // falls back to `previousStatus` if the server rejects the change.
    setStatus(parsed.data);
    startTransition(async () => {
      try {
        const result = await changeStatus(
          workspaceId,
          workspaceSlug,
          projectId,
          parsed.data,
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
        <SelectTrigger
          aria-label="Project status"
          className="w-32"
          aria-invalid={error !== null}
          aria-describedby={error !== null ? STATUS_ERROR_ID : undefined}
        >
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
        <p
          id={STATUS_ERROR_ID}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
