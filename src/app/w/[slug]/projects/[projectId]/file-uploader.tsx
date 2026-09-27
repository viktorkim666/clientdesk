"use client";

import { useId, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  buildStoragePath,
  PROJECT_FILES_BUCKET,
} from "@/lib/files/storage-path";
import { fileMetadataSchema } from "@/lib/validation/file";
import { registerFile } from "./actions";

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
  const [pending, startTransition] = useTransition();
  const inputId = useId();

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);

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
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="sr-only">
        Upload a file
      </Label>
      <input
        id={inputId}
        type="file"
        onChange={handleChange}
        disabled={pending}
        className="text-sm"
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
