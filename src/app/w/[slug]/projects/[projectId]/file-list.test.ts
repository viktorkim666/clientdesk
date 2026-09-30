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
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*"[^>]*>Uploaded by<\/th>/,
    );
    expect(html).toMatch(
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*"[^>]*>Size<\/th>/,
    );
    expect(html).toMatch(
      /<th[^>]*class="[^"]*hidden sm:table-cell[^"]*"[^>]*>Uploaded<\/th>/,
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
    const line =
      html.match(/<span[^>]*\bsm:hidden\b[^>]*>(.*?)<\/span><\/td>/)?.[1] ?? "";

    expect(line.replace(/<[^>]+>/g, "")).toBe(
      "Ada Lovelace · 2.0 KB · Mar 3, 2026",
    );
  });

  it("keeps the size and the date unbreakable in the small-screen line", () => {
    const html = render([file({})]);

    for (const chunk of ["2\\.0 KB", "Mar 3, 2026"]) {
      expect(html).toMatch(
        new RegExp(
          `<span[^>]*data-slot="file-meta-chunk"[^>]*\\bwhitespace-nowrap\\b[^>]*>${chunk}</span>|<span[^>]*\\bwhitespace-nowrap\\b[^>]*data-slot="file-meta-chunk"[^>]*>${chunk}</span>`,
        ),
      );
    }
  });

  it("gives the file name its own line: wrapping at any character, with the full name as a title", () => {
    const html = render([file({ name: "a-very-long-file-name.pdf" })]);
    const name =
      html.match(/<span[^>]*>a-very-long-file-name\.pdf<\/span>/)?.[0] ?? "";

    expect(name).toContain('data-slot="file-name"');
    expect(name).toContain('title="a-very-long-file-name.pdf"');
    expect(name).toContain("[overflow-wrap:anywhere]");
    expect(name).not.toContain("truncate");
  });

  it("marks up an explicit table structure, because rows turn into flex boxes below sm", () => {
    const html = render([file({})]);

    expect(html).toMatch(/<thead[^>]*role="rowgroup"/);
    expect(html).toMatch(/<tbody[^>]*role="rowgroup"/);
    expect(html.match(/<tr[^>]*role="row"/g)).toHaveLength(2);
    expect(html.match(/<th[^>]*role="columnheader"/g)).toHaveLength(5);
    // Name, uploader, size, date and actions.
    expect(html.match(/<td[^>]*role="cell"/g)).toHaveLength(5);
  });

  it("styles Download as an outline button and Delete as a destructive one", () => {
    const html = render([file({})]);
    const download = html.match(/<button[^>]*>Download<\/button>/)?.[0] ?? "";
    const remove = html.match(/<button[^>]*>Delete<\/button>/)?.[0] ?? "";

    expect(download).toContain("border-border");
    expect(download).not.toContain("bg-destructive/10");
    expect(remove).toContain("bg-destructive/10");
  });

  it("shows an empty state instead of a table with no files", () => {
    const html = render([]);
    expect(html).toContain("No files yet");
    expect(html).not.toContain("<table");
  });
});
