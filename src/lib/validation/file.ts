import { z } from "zod";

/**
 * Mirrors the `project-files` bucket's `file_size_limit` and MIME allowlist
 * (see supabase/config.toml and the projects-content migration), so the app
 * rejects an oversize or disallowed upload before it reaches Storage.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const fileMetadataSchema = z.object({
  name: z.string().trim().min(1, "File name is required").max(255),
  size: z
    .number()
    .int()
    .positive("File is empty")
    .max(MAX_FILE_BYTES, "File must be 10 MiB or smaller"),
  mimeType: z.enum(ALLOWED_MIME_TYPES, "This file type is not allowed"),
});

export type FileMetadataInput = z.infer<typeof fileMetadataSchema>;

const DEFAULT_FILE_NAME = "file";
const MAX_FILE_NAME_LENGTH = 100;

/**
 * Turns an arbitrary, user-supplied file name into one safe to use as the
 * last segment of a storage path: no path separators, no control
 * characters, no `..` traversal, capped length with the extension kept.
 */
export function safeFileName(name: string): string {
  const withoutControlChars = name.replace(/\p{Cc}/gu, "");
  const withoutSeparators = withoutControlChars.replace(/[/\\]+/g, "_");
  const withoutTraversal = withoutSeparators.replace(/\.{2,}/g, "_");
  const trimmed = withoutTraversal.trim();

  if (trimmed.length === 0) {
    return DEFAULT_FILE_NAME;
  }

  if (trimmed.length <= MAX_FILE_NAME_LENGTH) {
    return trimmed;
  }

  const lastDot = trimmed.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < trimmed.length - 1;
  if (!hasExtension) {
    return trimmed.slice(0, MAX_FILE_NAME_LENGTH);
  }

  const extension = trimmed.slice(lastDot);
  const maxBaseLength = MAX_FILE_NAME_LENGTH - extension.length;
  if (maxBaseLength <= 0) {
    return trimmed.slice(0, MAX_FILE_NAME_LENGTH);
  }

  return trimmed.slice(0, maxBaseLength) + extension;
}
