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
    // Below sm each row is a wrapping flex box: the name cell takes the first
    // line, the actions the next one. display:flex drops the native table
    // semantics in Safari/VoiceOver, hence the explicit roles on rows and cells.
    <TableRow
      role="row"
      className="max-sm:flex max-sm:flex-wrap max-sm:items-center"
    >
      <TableCell
        role="cell"
        className="min-w-0 whitespace-normal max-sm:w-full"
      >
        <div className="flex items-center gap-2">
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span
            data-slot="file-name"
            title={file.name}
            className="min-w-0 font-medium [overflow-wrap:anywhere]"
          >
            {file.name}
          </span>
        </div>
        <span className="block pl-6 text-xs font-normal text-muted-foreground sm:hidden">
          {file.uploaderName}
          {" · "}
          <span data-slot="file-meta-chunk" className="whitespace-nowrap">
            {formatSize(file.sizeBytes)}
          </span>
          {" · "}
          <span data-slot="file-meta-chunk" className="whitespace-nowrap">
            {formatDate(file.createdAt)}
          </span>
        </span>
        {rowError ? (
          <p role="alert" className="text-xs text-destructive">
            {rowError}
          </p>
        ) : null}
      </TableCell>
      <TableCell role="cell" className="hidden sm:table-cell">
        {file.uploaderName}
      </TableCell>
      <TableCell role="cell" className="hidden sm:table-cell">
        {formatSize(file.sizeBytes)}
      </TableCell>
      <TableCell role="cell" className="hidden sm:table-cell">
        {formatDate(file.createdAt)}
      </TableCell>
      {/* pl-8 = cell padding (0.5rem) + icon (1rem) + gap (0.5rem): the buttons
          start under the name text, not under its icon. */}
      <TableCell role="cell" className="max-sm:w-full max-sm:pt-0 max-sm:pl-8">
        <div className="flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
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
                  variant="destructive"
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
      <TableHeader className="max-sm:sr-only" role="rowgroup">
        <TableRow role="row">
          <TableHead role="columnheader">Name</TableHead>
          <TableHead role="columnheader" className="hidden sm:table-cell">
            Uploaded by
          </TableHead>
          <TableHead role="columnheader" className="hidden sm:table-cell">
            Size
          </TableHead>
          <TableHead role="columnheader" className="hidden sm:table-cell">
            Uploaded
          </TableHead>
          <TableHead role="columnheader" className="text-right">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup">
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
