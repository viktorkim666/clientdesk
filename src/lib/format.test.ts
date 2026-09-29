import { describe, expect, it } from "vitest";
import {
  fileKind,
  formatDate,
  formatExpiry,
  formatRelative,
  roleLabel,
  statusLabel,
} from "./format";

describe("statusLabel", () => {
  it.each([
    ["active", "Active"],
    ["on_hold", "On hold"],
    ["done", "Done"],
  ] as const)("labels %s as %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe("roleLabel", () => {
  it.each([
    ["owner", "Owner"],
    ["member", "Member"],
    ["client", "Client"],
  ] as const)("labels %s as %s", (role, label) => {
    expect(roleLabel(role)).toBe(label);
  });
});

describe("formatDate", () => {
  it("formats in en-US", () => {
    expect(formatDate("2026-09-29T12:00:00Z")).toBe("Sep 29, 2026");
  });

  it("returns a dash for an invalid ISO string instead of throwing", () => {
    expect(formatDate("not a date")).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("uses UTC so the day does not depend on the runtime timezone", () => {
    expect(formatDate("2026-09-29T23:59:59Z")).toBe("Sep 29, 2026");
    expect(formatDate("2026-09-30T00:00:00Z")).toBe("Sep 30, 2026");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("says just now under a minute", () => {
    expect(formatRelative(ago(0), now)).toBe("just now");
    expect(formatRelative(ago(59 * SECOND), now)).toBe("just now");
  });

  it("treats a timestamp slightly in the future as just now", () => {
    expect(formatRelative(ago(-30 * SECOND), now)).toBe("just now");
    expect(formatRelative(ago(-60 * SECOND), now)).toBe("just now");
  });

  it("falls back to the absolute date for a timestamp further in the future", () => {
    expect(formatRelative(ago(-61 * SECOND), now)).toBe("Sep 29, 2026");
    expect(formatRelative(ago(-DAY), now)).toBe("Sep 30, 2026");
  });

  it("returns a dash for an invalid ISO string instead of throwing", () => {
    expect(formatRelative("not a date", now)).toBe("—");
  });

  it("switches to minutes at 60 seconds", () => {
    expect(formatRelative(ago(MINUTE), now)).toBe("1 minute ago");
    expect(formatRelative(ago(59 * MINUTE + 59 * SECOND), now)).toBe(
      "59 minutes ago",
    );
  });

  it("switches to hours at 60 minutes", () => {
    expect(formatRelative(ago(HOUR), now)).toBe("1 hour ago");
    expect(formatRelative(ago(23 * HOUR + 59 * MINUTE), now)).toBe(
      "23 hours ago",
    );
  });

  it("switches to days at 24 hours", () => {
    expect(formatRelative(ago(DAY), now)).toBe("yesterday");
    expect(formatRelative(ago(2 * DAY), now)).toBe("2 days ago");
    expect(formatRelative(ago(6 * DAY + 23 * HOUR), now)).toBe("6 days ago");
  });

  it("switches to weeks at 7 days", () => {
    expect(formatRelative(ago(7 * DAY), now)).toBe("last week");
    expect(formatRelative(ago(14 * DAY), now)).toBe("2 weeks ago");
    expect(formatRelative(ago(27 * DAY), now)).toBe("3 weeks ago");
  });

  it("falls back to the absolute date from 28 days", () => {
    expect(formatRelative(ago(28 * DAY), now)).toBe("Sep 1, 2026");
    expect(formatRelative("2025-01-15T08:00:00Z", now)).toBe("Jan 15, 2025");
  });
});

describe("fileKind", () => {
  it.each([
    ["image/png", "image"],
    ["image/jpeg", "image"],
    ["image/svg+xml", "image"],
    ["application/pdf", "pdf"],
    ["application/zip", "archive"],
    ["application/x-zip-compressed", "archive"],
    ["application/gzip", "archive"],
    ["application/x-tar", "archive"],
    ["text/plain", "document"],
    ["text/markdown", "document"],
    ["application/msword", "document"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "document",
    ],
    ["application/octet-stream", "other"],
    ["video/mp4", "other"],
    ["", "other"],
  ] as const)("classifies %s as %s", (mime, kind) => {
    expect(fileKind(mime)).toBe(kind);
  });

  it("is case-insensitive", () => {
    expect(fileKind("Application/PDF")).toBe("pdf");
  });

  it.each([
    ["application/json", "document"],
    ["application/xml", "document"],
    ["application/rtf", "document"],
  ] as const)("classifies %s as %s", (mime, kind) => {
    expect(fileKind(mime)).toBe(kind);
  });

  it("ignores MIME parameters and surrounding whitespace", () => {
    expect(fileKind("text/plain; charset=utf-8")).toBe("document");
    expect(fileKind("application/pdf ; foo=bar")).toBe("pdf");
    expect(fileKind("image/png;q=1")).toBe("image");
    expect(fileKind("  application/json; charset=utf-8")).toBe("document");
  });

  it("treats a missing mime type as other", () => {
    expect(fileKind(null)).toBe("other");
  });
});

describe("formatExpiry", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it.each([
    ["2026-06-15T11:59:59Z", "Expired"],
    ["2026-06-15T12:00:00Z", "Expired"],
    ["2026-06-14T12:00:00Z", "Expired"],
    ["2026-06-15T12:00:01Z", "Expires in less than a day"],
    ["2026-06-16T11:59:59Z", "Expires in less than a day"],
    ["2026-06-16T12:00:00Z", "Expires in 1 day"],
    ["2026-06-17T11:59:59Z", "Expires in 1 day"],
    ["2026-06-18T12:00:00Z", "Expires in 3 days"],
    ["2026-06-22T12:00:00Z", "Expires in 7 days"],
  ])("formats %s as %s", (iso, text) => {
    expect(formatExpiry(iso, now)).toBe(text);
  });
});
