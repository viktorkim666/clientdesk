import { z } from "zod";
import { safeFileName } from "@/lib/validation/file";

/** The Storage bucket every project file lives in, shared by the server
 * action that registers/deletes files and the client uploader so the two
 * never drift apart. */
export const PROJECT_FILES_BUCKET = "project-files";

const uuidSchema = z.uuid();

export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export type StoragePathParts = {
  workspaceId: string;
  projectId: string;
  fileId: string;
  name: string;
};

/**
 * Builds the object path Storage RLS expects for the `project-files`
 * bucket: `{workspace_id}/{project_id}/{file_id}/{safe_name}`.
 */
export function buildStoragePath({
  workspaceId,
  projectId,
  fileId,
  name,
}: StoragePathParts): string {
  return `${workspaceId}/${projectId}/${fileId}/${safeFileName(name)}`;
}

/**
 * Parses a storage path back into its parts, returning null for anything
 * malformed (wrong segment count, a segment that is not a UUID) rather than
 * throwing, so callers can deny access instead of crashing on a bad path.
 */
export function parseStoragePath(path: string): StoragePathParts | null {
  const segments = path.split("/");
  if (segments.length !== 4) {
    return null;
  }

  const [workspaceId, projectId, fileId, name] = segments;
  if (!isUuid(workspaceId) || !isUuid(projectId) || !isUuid(fileId)) {
    return null;
  }
  if (name.length === 0) {
    return null;
  }

  return { workspaceId, projectId, fileId, name };
}
