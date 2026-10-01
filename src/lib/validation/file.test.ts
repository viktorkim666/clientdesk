import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  DEMO_ALLOWED_MIME_TYPES,
  DEMO_MAX_FILE_BYTES,
  DEMO_MAX_NEW_FILES,
  DEMO_UPLOAD_COUNT_LIMIT_CODE,
  DEMO_UPLOAD_HINT,
  MAX_FILE_BYTES,
  demoUploadErrorMessage,
  fileMetadataSchema,
  isStoragePolicyRefusal,
  safeFileName,
  storageUploadErrorMessage,
  validateDemoUpload,
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

describe("demo upload limits", () => {
  const png = { size: 1000, mimeType: "image/png" };

  it("matches the limits the database enforces", () => {
    expect(DEMO_MAX_NEW_FILES).toBe(5);
    expect(DEMO_MAX_FILE_BYTES).toBe(2 * 1024 * 1024);
    expect([...DEMO_ALLOWED_MIME_TYPES]).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]);
  });

  it("states the limits in the drop zone hint", () => {
    expect(DEMO_UPLOAD_HINT).toBe(
      "Demo: up to 5 files, 2 MB each, images or PDF",
    );
  });

  it.each(DEMO_ALLOWED_MIME_TYPES)("accepts a small %s", (mimeType) => {
    expect(validateDemoUpload({ size: 1000, mimeType }, 0)).toBeNull();
  });

  it("accepts a file of exactly 2 MB", () => {
    expect(
      validateDemoUpload({ ...png, size: DEMO_MAX_FILE_BYTES }, 0),
    ).toBeNull();
  });

  it("refuses a file one byte over 2 MB with a message that names the limit", () => {
    expect(
      validateDemoUpload({ ...png, size: DEMO_MAX_FILE_BYTES + 1 }, 0),
    ).toBe(
      "This file is over 2 MB, the limit in this demo. Choose a smaller one.",
    );
  });

  it.each(["text/plain", "application/zip", "image/svg+xml", ""])(
    "refuses the type %j",
    (mimeType) => {
      expect(validateDemoUpload({ size: 1000, mimeType }, 0)).toBe(
        "In this demo, files must be an image (PNG, JPEG, WebP or GIF) or a PDF.",
      );
    },
  );

  it("refuses a 6th upload and does not promise that deleting frees a slot", () => {
    expect(validateDemoUpload(png, 4)).toBeNull();
    const message = validateDemoUpload(png, 5);
    expect(message).toBe(
      "Demo limit reached: 5 uploads. Uploads are turned off for the rest of this demo.",
    );
    expect(message).not.toMatch(/delete/i);
  });

  it("reports the type before the size, and the size before the count", () => {
    expect(
      validateDemoUpload(
        { size: DEMO_MAX_FILE_BYTES + 1, mimeType: "text/plain" },
        5,
      ),
    ).toMatch(/must be an image/);
    expect(
      validateDemoUpload({ ...png, size: DEMO_MAX_FILE_BYTES + 1 }, 5),
    ).toMatch(/over 2 MB/);
  });
});

describe("demoUploadErrorMessage", () => {
  it.each([
    ["demo_upload_type_limit", /must be an image/],
    ["demo_upload_size_limit", /over 2 MB/],
    ["demo_upload_count_limit", /5 uploads/],
  ])("maps %s to its message", (code, pattern) => {
    expect(demoUploadErrorMessage(code)).toMatch(pattern);
  });

  it("returns null for any other database message", () => {
    expect(demoUploadErrorMessage("duplicate key value")).toBeNull();
  });
});

describe("DEMO_UPLOAD_COUNT_LIMIT_CODE", () => {
  it("is the message the database raises for the count limit", () => {
    expect(DEMO_UPLOAD_COUNT_LIMIT_CODE).toBe("demo_upload_count_limit");
    expect(demoUploadErrorMessage(DEMO_UPLOAD_COUNT_LIMIT_CODE)).toMatch(
      /5 uploads/,
    );
  });
});

describe("isStoragePolicyRefusal", () => {
  it.each([
    [{ message: "x", status: 403 }],
    [{ message: "x", statusCode: "403" }],
    [{ message: "new row violates row-level security policy" }],
    [{ message: "New Row Violates Row-Level Security Policy", status: 400 }],
  ])("recognizes %j", (error) => {
    expect(isStoragePolicyRefusal(error)).toBe(true);
  });

  it.each([
    [{ message: "Failed to fetch" }],
    [{ message: "Internal error", status: 500, statusCode: "500" }],
    [{ message: "Payload too large", status: 413, statusCode: "413" }],
    [{ message: "", status: undefined, statusCode: undefined }],
  ])("does not treat %j as a policy refusal", (error) => {
    expect(isStoragePolicyRefusal(error)).toBe(false);
  });
});

describe("storageUploadErrorMessage", () => {
  const policy = { message: "row-level security", status: 403 };
  const network = { message: "Failed to fetch" };

  it("explains the count limit in a sandbox when Storage refused by policy", () => {
    expect(storageUploadErrorMessage(policy, true)).toBe(
      "Could not upload the file. Demo limit reached: 5 uploads. Uploads are turned off for the rest of this demo.",
    );
  });

  it("stays generic in a sandbox for any other Storage error", () => {
    expect(storageUploadErrorMessage(network, true)).toBe(
      "Could not upload the file",
    );
  });

  it("stays generic outside a sandbox, even for a policy refusal", () => {
    expect(storageUploadErrorMessage(policy, false)).toBe(
      "Could not upload the file",
    );
  });
});
