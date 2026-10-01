import { describe, expect, it } from "vitest";
import { resolveMetadataBase } from "./site";

const siteUrl = "https://clientdesk.example.com";
const branchUrl = "clientdesk-git-feat-deploy-owner.vercel.app";

describe("resolveMetadataBase", () => {
  it("uses the branch URL with https on a preview deployment", () => {
    const base = resolveMetadataBase({
      siteUrl,
      vercelEnv: "preview",
      vercelBranchUrl: branchUrl,
    });

    expect(base.href).toBe(`https://${branchUrl}/`);
  });

  it("uses the site URL in production", () => {
    const base = resolveMetadataBase({
      siteUrl,
      vercelEnv: "production",
      vercelBranchUrl: branchUrl,
    });

    expect(base.href).toBe(`${siteUrl}/`);
  });

  it("uses the site URL when VERCEL_ENV is development", () => {
    const base = resolveMetadataBase({
      siteUrl,
      vercelEnv: "development",
      vercelBranchUrl: branchUrl,
    });

    expect(base.href).toBe(`${siteUrl}/`);
  });

  it("uses the site URL outside Vercel", () => {
    const base = resolveMetadataBase({
      siteUrl: "http://localhost:3000",
      vercelEnv: undefined,
      vercelBranchUrl: undefined,
    });

    expect(base.href).toBe("http://localhost:3000/");
  });

  it("falls back to the site URL on a preview without a branch URL", () => {
    const base = resolveMetadataBase({ siteUrl, vercelEnv: "preview" });

    expect(base.href).toBe(`${siteUrl}/`);
  });

  it("returns a URL instance", () => {
    expect(resolveMetadataBase({ siteUrl })).toBeInstanceOf(URL);
  });
});
