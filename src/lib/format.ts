import type { ProjectStatus } from "@/lib/validation/project";
import type { WorkspaceRole } from "@/lib/validation/invitation";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  done: "Done",
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  member: "Member",
  client: "Client",
};

export type FileKind = "image" | "pdf" | "archive" | "document" | "other";

export function statusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status];
}

export function roleLabel(role: WorkspaceRole): string {
  return ROLE_LABELS[role];
}

// Fixed locale and timezone so the server and the browser print the same text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const INVALID_DATE = "—";

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? INVALID_DATE : dateFormat.format(date);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const RELATIVE_LIMIT = 4 * WEEK;
// Clock skew between the server and the database can put a fresh row slightly
// ahead of `now`; anything beyond this is a real future date.
const FUTURE_SKEW = MINUTE;

export function formatRelative(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return INVALID_DATE;
  const elapsed = now.getTime() - then;

  if (elapsed < -FUTURE_SKEW) return formatDate(iso);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    return relativeFormat.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return relativeFormat.format(-Math.floor(elapsed / HOUR), "hour");
  }
  if (elapsed < WEEK) {
    return relativeFormat.format(-Math.floor(elapsed / DAY), "day");
  }
  if (elapsed < RELATIVE_LIMIT) {
    return relativeFormat.format(-Math.floor(elapsed / WEEK), "week");
  }
  return formatDate(iso);
}

export function formatExpiry(iso: string, now: Date): string {
  const remaining = new Date(iso).getTime() - now.getTime();

  if (remaining <= 0) return "Expired";
  if (remaining < DAY) return "Expires in less than a day";
  const days = Math.floor(remaining / DAY);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

const ARCHIVE_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
]);

const DOCUMENT_TYPES = new Set([
  "application/msword",
  "application/json",
  "application/xml",
  "application/rtf",
]);

export function fileKind(mimeType: string | null): FileKind {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();

  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (ARCHIVE_TYPES.has(type)) return "archive";
  if (
    type.startsWith("text/") ||
    DOCUMENT_TYPES.has(type) ||
    type.startsWith("application/vnd.openxmlformats-officedocument.") ||
    type.startsWith("application/vnd.ms-")
  ) {
    return "document";
  }
  return "other";
}
