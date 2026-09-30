import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DEMO_DIR = path.resolve(import.meta.dirname, "../../../supabase/demo");
const FILES_DIR = path.join(DEMO_DIR, "files");

type FileRow = { name: string; sizeBytes: number; mimeType: string };

// The template's file rows look like
// (1, 3, 2, interval '25 hours', 'name.pdf', 2516582, 'application/pdf').
// No other row in template.sql has that shape.
function templateFileRows(): FileRow[] {
  const sql = readFileSync(path.join(DEMO_DIR, "template.sql"), "utf8");
  const pattern =
    /\(\d+, \d+, \d+, interval '[^']+', '([^']+)', (\d+), '([^']+)'\)/g;
  return Array.from(sql.matchAll(pattern), (match) => ({
    name: match[1],
    sizeBytes: Number(match[2]),
    mimeType: match[3],
  }));
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("template file blobs", () => {
  const rows = templateFileRows();

  it("finds the 8 file rows in template.sql", () => {
    expect(rows).toHaveLength(8);
  });

  it("has exactly one blob per row and no others", () => {
    expect(readdirSync(FILES_DIR).sort()).toEqual(
      rows.map((row) => row.name).sort(),
    );
  });

  it.each(templateFileRows())(
    "$name matches its row's size and type",
    ({ name, sizeBytes, mimeType }) => {
      const blob = readFileSync(path.join(FILES_DIR, name));

      expect(blob.length).toBe(sizeBytes);

      if (mimeType === "image/png") {
        expect(blob.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      } else if (mimeType === "application/pdf") {
        expect(blob.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(blob.toString("latin1").trimEnd().endsWith("%%EOF")).toBe(true);
      } else {
        // .docx is a ZIP archive.
        expect(name.endsWith(".docx")).toBe(true);
        expect(blob.subarray(0, 4).toString("latin1")).toBe("PK\u0003\u0004");
      }
    },
  );
});
