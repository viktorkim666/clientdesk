import { describe, expect, it } from "vitest";
import { isWorkspaceSlug, slugify } from "@/lib/slug";

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

describe("isWorkspaceSlug", () => {
  it.each(["acme-agency", "acme-agency-3f9a1c", "studio-54", "-3f9a1c"])(
    "accepts %j, a shape create_workspace() can produce",
    (slug) => {
      expect(isWorkspaceSlug(slug)).toBe(true);
    },
  );

  it.each([
    "",
    "acme/agency",
    "../acme",
    "Acme",
    "acme agency",
    "acme?x=1",
    "acme\n",
    "acme-agéncy",
  ])("rejects %j", (slug) => {
    expect(isWorkspaceSlug(slug)).toBe(false);
  });
});
