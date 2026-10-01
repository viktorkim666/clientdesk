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

/**
 * Demo sandbox limits. The database enforces them in
 * `private.enforce_demo_upload_limits`
 * (supabase/migrations/20261001110000_demo_upload_limits.sql); these copies
 * let the uploader refuse a file before it uploads, with a clearer message.
 */
export const DEMO_MAX_NEW_FILES = 5;
export const DEMO_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DEMO_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

const DEMO_MAX_FILE_MB = DEMO_MAX_FILE_BYTES / (1024 * 1024);

export const DEMO_UPLOAD_HINT = `Demo: up to ${DEMO_MAX_NEW_FILES}\u00a0files, ${DEMO_MAX_FILE_MB}\u00a0MB each, images or PDF`;

/** Shown when the sandbox has used all its uploads. Deleting a file does not
 * free a slot: the database counts every upload for the life of the sandbox. */
export const DEMO_COUNT_MESSAGE = `Demo limit reached: ${DEMO_MAX_NEW_FILES} uploads. Uploads are turned off for the rest of this demo.`;

const DEMO_TYPE_MESSAGE =
  "In this demo, files must be an image (PNG, JPEG, WebP or GIF) or a PDF.";
const DEMO_SIZE_MESSAGE = `This file is over ${DEMO_MAX_FILE_MB} MB, the limit in this demo. Choose a smaller one.`;

const isDemoMimeType = (mimeType: string) =>
  (DEMO_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);

/**
 * The first demo rule a file breaks, as a message for the uploader, or
 * `null` when it passes. `uploadedSoFar` is how many files the visitor has
 * already added to the sandbox.
 */
export function validateDemoUpload(
  file: { size: number; mimeType: string },
  uploadedSoFar: number,
): string | null {
  if (!isDemoMimeType(file.mimeType)) return DEMO_TYPE_MESSAGE;
  if (file.size > DEMO_MAX_FILE_BYTES) return DEMO_SIZE_MESSAGE;
  if (uploadedSoFar >= DEMO_MAX_NEW_FILES) return DEMO_COUNT_MESSAGE;
  return null;
}

/** Errcode the file trigger raises (CD005); the message tells which rule. */
export const DEMO_UPLOAD_ERROR_CODE = "CD005";

export const DEMO_UPLOAD_TYPE_LIMIT_CODE = "demo_upload_type_limit";
export const DEMO_UPLOAD_SIZE_LIMIT_CODE = "demo_upload_size_limit";
export const DEMO_UPLOAD_COUNT_LIMIT_CODE = "demo_upload_count_limit";

/**
 * Maps the message of a CD005 error from the database to the same text
 * `validateDemoUpload` gives, or `null` for any other message.
 */
export function demoUploadErrorMessage(databaseMessage: string): string | null {
  switch (databaseMessage) {
    case DEMO_UPLOAD_TYPE_LIMIT_CODE:
      return DEMO_TYPE_MESSAGE;
    case DEMO_UPLOAD_SIZE_LIMIT_CODE:
      return DEMO_SIZE_MESSAGE;
    case DEMO_UPLOAD_COUNT_LIMIT_CODE:
      return DEMO_COUNT_MESSAGE;
    default:
      return null;
  }
}

/** The fields of a Storage error (`StorageError` in `@supabase/storage-js`)
 * that tell a policy refusal from other failures. */
type StorageErrorLike = {
  message: string;
  status?: number;
  statusCode?: string;
};

/**
 * True when Storage refused the upload because a row-level security policy
 * said no: HTTP 403, or the Postgres message about row-level security.
 */
export function isStoragePolicyRefusal(error: StorageErrorLike): boolean {
  return (
    error.status === 403 ||
    error.statusCode === "403" ||
    /row-level security/i.test(error.message)
  );
}

const GENERIC_UPLOAD_ERROR = "Could not upload the file";

/**
 * The message for a failed Storage upload. In a sandbox the storage policy
 * also caps the object count and refuses with a generic message, so a policy
 * refusal there is explained as the count limit; any other error stays generic.
 */
export function storageUploadErrorMessage(
  error: StorageErrorLike,
  isDemo: boolean,
): string {
  return isDemo && isStoragePolicyRefusal(error)
    ? `${GENERIC_UPLOAD_ERROR}. ${DEMO_COUNT_MESSAGE}`
    : GENERIC_UPLOAD_ERROR;
}

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
