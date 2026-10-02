import { describe, expect, it } from "vitest";
import {
  describeProjectContents,
  matchesProjectName,
} from "./project-delete-state";

describe("matchesProjectName", () => {
  it("matches the exact name", () => {
    expect(
      matchesProjectName(
        "Client A Website Redesign",
        "Client A Website Redesign",
      ),
    ).toBe(true);
  });

  it("ignores leading and trailing spaces", () => {
    expect(matchesProjectName("  Brand Refresh  ", "Brand Refresh")).toBe(true);
  });

  it("treats runs of spaces as one, on both sides", () => {
    expect(matchesProjectName("Brand    Refresh", "Brand Refresh")).toBe(true);
    expect(matchesProjectName("Brand Refresh", "Brand   Refresh")).toBe(true);
    expect(matchesProjectName("Brand\t\nRefresh", "Brand Refresh")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(matchesProjectName("brand refresh", "Brand Refresh")).toBe(false);
  });

  it("does not match an empty input", () => {
    expect(matchesProjectName("", "Brand Refresh")).toBe(false);
    expect(matchesProjectName("   ", "Brand Refresh")).toBe(false);
  });

  it("does not match a different name", () => {
    expect(matchesProjectName("Brand", "Brand Refresh")).toBe(false);
  });
});

describe("describeProjectContents", () => {
  it("lists updates, comments and files with counts", () => {
    expect(describeProjectContents({ updates: 3, comments: 5, files: 2 })).toBe(
      "3 updates, 5 comments and 2 files",
    );
  });

  it("uses the singular for one", () => {
    expect(describeProjectContents({ updates: 1, comments: 1, files: 1 })).toBe(
      "1 update, 1 comment and 1 file",
    );
  });

  it("leaves out what the project does not have", () => {
    expect(describeProjectContents({ updates: 2, comments: 0, files: 1 })).toBe(
      "2 updates and 1 file",
    );
    expect(describeProjectContents({ updates: 0, comments: 0, files: 4 })).toBe(
      "4 files",
    );
  });

  it("says the project is empty when all counts are zero", () => {
    expect(describeProjectContents({ updates: 0, comments: 0, files: 0 })).toBe(
      null,
    );
  });
});
