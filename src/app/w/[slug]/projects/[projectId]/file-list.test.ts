import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  deleteFile: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

import { FileList, type ProjectFileRow } from "./file-list";

function file(overrides: Partial<ProjectFileRow>): ProjectFileRow {
  return {
    id: "f1",
    name: "report.pdf",
    sizeBytes: 2048,
    storagePath: "w/p/f1/report.pdf",
    uploadedBy: "u1",
    uploaderName: "Ada Lovelace",
    mimeType: "application/pdf",
    createdAt: "2026-03-03T10:00:00Z",
    ...overrides,
  };
}

function render(files: ProjectFileRow[], isStaff = true) {
  return renderToStaticMarkup(
    createElement(FileList, {
      workspaceId: "w",
      workspaceSlug: "acme",
      projectId: "p",
      files,
      currentUserId: "u1",
      isStaff,
    }),
  );
}

describe("FileList", () => {
  it("maps the mime type to an aria-hidden type icon", () => {
    const cases: [string, string][] = [
      ["image/png", "lucide-file-image"],
      ["application/pdf", "lucide-file-text"],
      ["application/zip", "lucide-file-archive"],
      ["text/plain", "lucide-file-text"],
      ["application/octet-stream", "lucide-file"],
    ];
    for (const [mimeType, iconClass] of cases) {
      const html = render([file({ mimeType })]);
      expect(html).toMatch(
        new RegExp(
          `<svg[^>]*class="[^"]*${iconClass}(?: |")[^>]*aria-hidden="true"|<svg[^>]*aria-hidden="true"[^>]*class="[^"]*${iconClass}(?: |")`,
        ),
      );
    }
  });

  it("shows the uploader, the size and the upload date", () => {
    const html = render([file({})]);
    expect(html).toContain("report.pdf");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("Mar 3, 2026");
    expect(html).toMatch(/<th[^>]*>Uploaded<\/th>/);
  });

  it("hides the secondary columns below sm", () => {
    const html = render([file({})]);
    expect(html).toMatch(
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*">Uploaded by<\/th>/,
    );
    expect(html).toMatch(
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*">Size<\/th>/,
    );
    expect(html).toMatch(
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*">Uploaded<\/th>/,
    );
  });

  it("keeps the Download and Delete buttons", () => {
    const html = render([file({})]);
    expect(html).toMatch(/<button[^>]*>Download<\/button>/);
    expect(html).toMatch(/<button[^>]*>Delete<\/button>/);
  });

  it("gives each row's buttons a unique name that starts with the visible word", () => {
    const html = render([
      file({ id: "f1", name: "report.pdf" }),
      file({ id: "f2", name: "notes.txt", mimeType: "text/plain" }),
    ]);

    for (const name of ["report.pdf", "notes.txt"]) {
      expect(html).toMatch(
        new RegExp(`<button[^>]*aria-label="Download ${name}"[^>]*>Download<`),
      );
      expect(html).toMatch(
        new RegExp(`<button[^>]*aria-label="Delete ${name}"[^>]*>Delete<`),
      );
    }
  });

  it("asks for confirmation before deleting: the Delete button only opens a dialog", () => {
    const html = render([file({})]);
    const button = html.match(/<button[^>]*>Delete<\/button>/)?.[0] ?? "";

    expect(button).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Delete report.pdf?");
  });

  it("repeats uploader, size and date as a muted line under the name for small screens", () => {
    const html = render([file({})]);

    expect(html).toMatch(
      /report\.pdf<\/span><\/div><span[^>]*\bsm:hidden\b[^>]*>Ada Lovelace · 2\.0 KB · Mar 3, 2026<\/span>/,
    );
  });

  it("shows an empty state instead of a table with no files", () => {
    const html = render([]);
    expect(html).toContain("No files yet");
    expect(html).not.toContain("<table");
  });
});
