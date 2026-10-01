"use client";

import { useId, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildStoragePath,
  PROJECT_FILES_BUCKET,
} from "@/lib/files/storage-path";
import {
  DEMO_ALLOWED_MIME_TYPES,
  DEMO_COUNT_MESSAGE,
  DEMO_MAX_NEW_FILES,
  DEMO_UPLOAD_HINT,
  fileMetadataSchema,
  MAX_FILE_BYTES,
  storageUploadErrorMessage,
  validateDemoUpload,
} from "@/lib/validation/file";
import { registerFile } from "./actions";

const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);

/** The error line under the drop zone. `announceOnly` keeps it for screen
 * readers when the drop zone's hint already shows the same sentence. */
export function UploadError({
  id,
  message,
  announceOnly,
}: {
  id: string;
  message: string;
  announceOnly: boolean;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={announceOnly ? "sr-only" : "text-sm text-destructive"}
    >
      {message}
    </p>
  );
}

export function FileUploader({
  workspaceId,
  workspaceSlug,
  projectId,
  demoUploadsUsed,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  /** Files the visitor has added to this demo sandbox, or `null` outside a sandbox. */
  demoUploadsUsed: number | null;
}) {
  const isDemo = demoUploadsUsed !== null;
  const limitReached = isDemo && demoUploadsUsed >= DEMO_MAX_NEW_FILES;
  const [error, setError] = useState<string | null>(null);
  // Bumped on every failure and used as the alert's key, so the same message
  // twice in a row is a new node and a screen reader announces it again.
  const [attempt, setAttempt] = useState(0);
  // Announced through the role="status" line below: "Uploading x…", then
  // "Uploaded x". Empty when nothing has been picked or the upload failed.
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  function fail(message: string) {
    setAttempt((n) => n + 1);
    setError(message);
  }

  // The input is aria-disabled, not disabled, once the sandbox is out of
  // uploads so it stays focusable; the click is stopped here instead and
  // says why.
  function handleClick(event: React.MouseEvent<HTMLInputElement>) {
    if (!limitReached) return;
    event.preventDefault();
    fail(DEMO_COUNT_MESSAGE);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    // The input is aria-disabled, not disabled, while an upload runs so it
    // keeps focus; a pick made in that window is dropped, and said so.
    if (pending) {
      setStatus("Wait for the current upload to finish");
      return;
    }

    setError(null);
    setStatus("");

    const parsed = fileMetadataSchema.safeParse({
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Invalid file");
      return;
    }
    const metadata = parsed.data;

    if (isDemo) {
      const demoError = validateDemoUpload(
        { size: metadata.size, mimeType: metadata.mimeType },
        demoUploadsUsed,
      );
      if (demoError) {
        fail(demoError);
        return;
      }
    }

    setStatus(`Uploading ${metadata.name}…`);
    startTransition(async () => {
      const supabase = createClient();
      const storagePath = buildStoragePath({
        workspaceId,
        projectId,
        fileId: crypto.randomUUID(),
        name: metadata.name,
      });

      const { error: uploadError } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .upload(storagePath, file, { contentType: metadata.mimeType });

      if (uploadError) {
        setStatus("");
        fail(storageUploadErrorMessage(uploadError, isDemo));
        return;
      }

      const result = await registerFile(
        workspaceId,
        workspaceSlug,
        projectId,
        storagePath,
        metadata,
      );

      if (!result.ok) {
        // Metadata registration failed after the upload succeeded; remove
        // the now-orphaned object instead of leaving it unlisted in Storage.
        await supabase.storage.from(PROJECT_FILES_BUCKET).remove([storagePath]);
        setStatus("");
        fail(result.error);
        return;
      }

      setStatus(`Uploaded ${metadata.name}`);
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <input
          id={inputId}
          type="file"
          onChange={handleChange}
          onClick={handleClick}
          aria-disabled={pending || limitReached}
          accept={isDemo ? DEMO_ALLOWED_MIME_TYPES.join(",") : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-muted/30 p-3 transition-colors outline-none peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-aria-disabled:cursor-not-allowed peer-aria-disabled:opacity-60 hover:bg-muted/50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
            <Upload aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {pending ? "Uploading…" : "Upload a file"}
            </span>
            <span
              id={hintId}
              aria-hidden="true"
              className="block text-xs text-balance text-muted-foreground"
            >
              {isDemo
                ? limitReached
                  ? DEMO_COUNT_MESSAGE
                  : DEMO_UPLOAD_HINT
                : `PDF, images, Office files, ZIP, text or CSV, up to ${MAX_FILE_MB} MB`}
            </span>
          </span>
        </label>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      {error ? (
        <UploadError
          key={attempt}
          id={errorId}
          message={error}
          // At the limit the hint already shows this sentence.
          announceOnly={limitReached && error === DEMO_COUNT_MESSAGE}
        />
      ) : null}
    </div>
  );
}
