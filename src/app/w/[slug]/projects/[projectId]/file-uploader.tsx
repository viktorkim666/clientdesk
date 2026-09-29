"use client";

import { useId, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildStoragePath,
  PROJECT_FILES_BUCKET,
} from "@/lib/files/storage-path";
import { fileMetadataSchema, MAX_FILE_BYTES } from "@/lib/validation/file";
import { registerFile } from "./actions";

const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);

export function FileUploader({
  workspaceId,
  workspaceSlug,
  projectId,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  // Announced through the role="status" line below: "Uploading x…", then
  // "Uploaded x". Empty when nothing has been picked or the upload failed.
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const hintId = useId();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    // The input is aria-disabled, not disabled, while an upload runs so it
    // keeps focus; a pick made in that window is dropped here.
    if (!file || pending) return;

    setError(null);
    setStatus("");

    const parsed = fileMetadataSchema.safeParse({
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid file");
      return;
    }
    const metadata = parsed.data;

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
        setError("Could not upload the file");
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
        setError(result.error);
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
          aria-disabled={pending}
          aria-describedby={hintId}
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
              className="block text-xs text-muted-foreground"
            >
              PDF, images, Office files, ZIP, text or CSV, up to {MAX_FILE_MB}{" "}
              MB
            </span>
          </span>
        </label>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
