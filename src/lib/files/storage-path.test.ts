import { describe, expect, it } from "vitest";
import {
  buildStoragePath,
  parseStoragePath,
  PROJECT_FILES_BUCKET,
} from "@/lib/files/storage-path";

const workspaceId = "bab4cc25-726d-4fe0-a153-91d24fe07f10";
const projectId = "c3f8a1e2-6b7d-4c9f-9a1b-2d3e4f5a6b7c";
const fileId = "d4e9b2f3-7c8e-5d0a-ab2c-3e4f5a6b7c8d";

describe("PROJECT_FILES_BUCKET", () => {
  it("names the project-files bucket", () => {
    expect(PROJECT_FILES_BUCKET).toBe("project-files");
  });
});

describe("buildStoragePath", () => {
  it("builds a path with the four segments in order", () => {
    expect(
      buildStoragePath({ workspaceId, projectId, fileId, name: "invoice.pdf" }),
    ).toBe(`${workspaceId}/${projectId}/${fileId}/invoice.pdf`);
  });

  it("sanitizes a traversal attempt in the name", () => {
    const path = buildStoragePath({
      workspaceId,
      projectId,
      fileId,
      name: "../../etc/passwd",
    });
    const name = path.slice(`${workspaceId}/${projectId}/${fileId}/`.length);
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });
});

describe("parseStoragePath", () => {
  it("parses a well-formed path", () => {
    expect(
      parseStoragePath(`${workspaceId}/${projectId}/${fileId}/invoice.pdf`),
    ).toEqual({ workspaceId, projectId, fileId, name: "invoice.pdf" });
  });

  it("returns null for too few segments", () => {
    expect(parseStoragePath(`${workspaceId}/${projectId}/invoice.pdf`)).toBe(
      null,
    );
  });

  it("returns null for too many segments", () => {
    expect(
      parseStoragePath(`${workspaceId}/${projectId}/${fileId}/sub/invoice.pdf`),
    ).toBe(null);
  });

  it("returns null when the workspace segment is not a uuid", () => {
    expect(
      parseStoragePath(`not-a-uuid/${projectId}/${fileId}/invoice.pdf`),
    ).toBe(null);
  });

  it("returns null when the project segment is not a uuid", () => {
    expect(
      parseStoragePath(`${workspaceId}/not-a-uuid/${fileId}/invoice.pdf`),
    ).toBe(null);
  });

  it("returns null when the file segment is not a uuid", () => {
    expect(
      parseStoragePath(`${workspaceId}/${projectId}/not-a-uuid/invoice.pdf`),
    ).toBe(null);
  });

  it("returns null for an empty string", () => {
    expect(parseStoragePath("")).toBe(null);
  });

  it("returns null when the name segment is empty", () => {
    expect(parseStoragePath(`${workspaceId}/${projectId}/${fileId}/`)).toBe(
      null,
    );
  });
});
