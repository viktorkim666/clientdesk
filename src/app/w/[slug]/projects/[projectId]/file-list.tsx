"use client";

import {
  File as FileIcon,
  FileArchive,
  FileImage,
  FileText,
  Files,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fileKind, formatDate, type FileKind } from "@/lib/format";
import { deleteFile, getDownloadUrl } from "./actions";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

// The Files card heading, which takes focus once a deleted row is gone.
export const FILES_HEADING_ID = "files-heading";

export type ProjectFileRow = {
  id: string;
  name: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string | null;
  uploaderName: string;
  mimeType: string | null;
  createdAt: string;
};

const KIND_ICONS: Record<FileKind, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  archive: FileArchive,
  document: FileText,
  other: FileIcon,
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
        if (result.ok) {
          document.getElementById(FILES_HEADING_ID)?.focus();
        } else {
          setDeleteError(result.error);
        }
      } catch {
        setDeleteError("Could not delete the file");
      }
    });
  }

  const rowError = downloadError ?? deleteError;
  const Icon = KIND_ICONS[fileKind(file.mimeType)];

  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="flex items-center gap-2">
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 font-medium break-all">{file.name}</span>
        </div>
        <span className="block pl-6 text-xs font-normal text-muted-foreground sm:hidden">
          {`${file.uploaderName} · ${formatSize(file.sizeBytes)} · ${formatDate(file.createdAt)}`}
        </span>
        {rowError ? (
          <p role="alert" className="text-xs text-destructive">
            {rowError}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {file.uploaderName}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {formatSize(file.sizeBytes)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {formatDate(file.createdAt)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={downloadPending}
            onClick={handleDownload}
            aria-label={`${downloadPending ? "Downloading" : "Download"} ${file.name}`}
          >
            {downloadPending ? "Downloading..." : "Download"}
          </Button>
          {canDelete ? (
            <ConfirmDeleteDialog
              title={`Delete ${file.name}?`}
              description="The file is removed for everyone on this project and can't be restored."
              onConfirm={handleDelete}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deletePending}
                  aria-label={`${deletePending ? "Deleting" : "Delete"} ${file.name}`}
                >
                  {deletePending ? "Deleting..." : "Delete"}
                </Button>
              }
            />
          ) : null}
        </div>
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
  if (files.length === 0) {
    return (
      <EmptyState
        icon={Files}
        title="No files yet"
        description="Files shared on this project will appear here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="hidden sm:table-cell">Uploaded by</TableHead>
          <TableHead className="hidden sm:table-cell">Size</TableHead>
          <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
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
      </TableBody>
    </Table>
  );
}
