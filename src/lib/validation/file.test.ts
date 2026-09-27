import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  fileMetadataSchema,
  safeFileName,
} from "@/lib/validation/file";

describe("fileMetadataSchema", () => {
  const valid = {
    name: "invoice.pdf",
    size: 1024,
    mimeType: "application/pdf",
  };

  it("accepts a valid file", () => {
    expect(fileMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it.each(ALLOWED_MIME_TYPES)("accepts allowed mime type %s", (mimeType) => {
    expect(fileMetadataSchema.safeParse({ ...valid, mimeType }).success).toBe(
      true,
    );
  });

  it("rejects an svg file", () => {
    expect(
      fileMetadataSchema.safeParse({ ...valid, mimeType: "image/svg+xml" })
        .success,
    ).toBe(false);
  });

  it("rejects an html file", () => {
    expect(
      fileMetadataSchema.safeParse({ ...valid, mimeType: "text/html" }).success,
    ).toBe(false);
  });

  it("accepts a file at the 10 MiB limit", () => {
    expect(
      fileMetadataSchema.safeParse({ ...valid, size: MAX_FILE_BYTES }).success,
    ).toBe(true);
  });

  it("rejects a file over the 10 MiB limit", () => {
    expect(
      fileMetadataSchema.safeParse({ ...valid, size: MAX_FILE_BYTES + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    expect(fileMetadataSchema.safeParse({ ...valid, size: 0 }).success).toBe(
      false,
    );
  });

  it("rejects a negative size", () => {
    expect(fileMetadataSchema.safeParse({ ...valid, size: -1 }).success).toBe(
      false,
    );
  });

  it("rejects an empty name", () => {
    expect(fileMetadataSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false,
    );
  });
});

describe("safeFileName", () => {
  it("keeps a normal name unchanged", () => {
    expect(safeFileName("invoice.pdf")).toBe("invoice.pdf");
  });

  it("keeps a unicode name unchanged", () => {
    expect(safeFileName("Rechnung_Über_März.pdf")).toBe(
      "Rechnung_Über_März.pdf",
    );
  });

  it("preserves an emoji in the name", () => {
    expect(safeFileName("summary-👍.pdf")).toBe("summary-👍.pdf");
  });

  it("strips path separators", () => {
    const result = safeFileName("folder/sub\\file.txt");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });

  it("neutralizes a parent directory traversal attempt", () => {
    const result = safeFileName("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
  });

  it("strips control characters", () => {
    const result = safeFileName("bad\u0000name\u0007.txt");
    expect(result).not.toMatch(/[\u0000-\u001F\u007F]/);
    expect(result.endsWith(".txt")).toBe(true);
  });

  it("falls back to a default name when the input is empty", () => {
    expect(safeFileName("")).toBe("file");
  });

  it("falls back to a default name when only whitespace remains", () => {
    expect(safeFileName("   ")).toBe("file");
  });

  it("falls back to a default name when only control characters remain", () => {
    expect(safeFileName("\u0000\u0001")).toBe("file");
  });

  it("caps an overly long name while preserving the extension", () => {
    const result = safeFileName(`${"a".repeat(200)}.pdf`);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("caps an overly long name with no extension", () => {
    const result = safeFileName("a".repeat(200));
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("caps a name whose extension alone exceeds the length limit", () => {
    const result = safeFileName(`a.${"b".repeat(200)}`);
    expect(result.length).toBeLessThanOrEqual(100);
  });
});
