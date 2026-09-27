"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteFile, getDownloadUrl } from "./actions";

export type ProjectFileRow = {
  id: string;
  name: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string | null;
  uploaderName: string;
};

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

function formatSize(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${SIZE_UNITS[unitIndex]}`;
}

// Each row owns its own pending/error state, so downloading or deleting one
// file never disables the buttons on every other row in the table.
function FileRow({
  workspaceId,
  workspaceSlug,
  projectId,
  file,
  canDelete,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  file: ProjectFileRow;
  canDelete: boolean;
}) {
  const [downloadPending, startDownload] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDownload() {
    setDownloadError(null);
    startDownload(async () => {
      try {
        const result = await getDownloadUrl(projectId, file.id);
        if (!result.ok) {
          setDownloadError(result.error);
          return;
        }
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      } catch {
        setDownloadError("Could not create a download link");
      }
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startDelete(async () => {
      try {
        const result = await deleteFile(
          workspaceId,
          workspaceSlug,
          projectId,
          file.id,
        );
        if (!result.ok) {
          setDeleteError(result.error);
        }
      } catch {
        setDeleteError("Could not delete the file");
      }
    });
  }

  const rowError = downloadError ?? deleteError;

  return (
    <TableRow>
      <TableCell>
        {file.name}
        {rowError ? (
          <p role="alert" className="text-xs text-destructive">
            {rowError}
          </p>
        ) : null}
      </TableCell>
      <TableCell>{file.uploaderName}</TableCell>
      <TableCell>{formatSize(file.sizeBytes)}</TableCell>
      <TableCell className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloadPending}
          onClick={handleDownload}
        >
          {downloadPending ? "Downloading..." : "Download"}
        </Button>
        {canDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deletePending}
            onClick={handleDelete}
          >
            {deletePending ? "Deleting..." : "Delete"}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function FileList({
  workspaceId,
  workspaceSlug,
  projectId,
  files,
  currentUserId,
  isStaff,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  files: ProjectFileRow[];
  currentUserId: string;
  isStaff: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Uploaded by</TableHead>
          <TableHead>Size</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <FileRow
            key={file.id}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            file={file}
            canDelete={isStaff || file.uploadedBy === currentUserId}
          />
        ))}
        {files.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              No files yet.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
