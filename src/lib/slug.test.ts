import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Acme Agency")).toBe("acme-agency");
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("Acme & Sons!!  Co.")).toBe("acme-sons-co");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--Acme--")).toBe("acme");
  });

  it("keeps digits", () => {
    expect(slugify("Studio 54")).toBe("studio-54");
  });

  it("returns an empty string for input with no alphanumeric characters", () => {
    expect(slugify("!!!")).toBe("");
  });
});
