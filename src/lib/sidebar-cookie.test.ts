import { describe, expect, it } from "vitest";
import { sidebarStateCookie } from "./sidebar-cookie";

describe("sidebarStateCookie", () => {
  it("writes the open state with path, max-age and SameSite=Lax", () => {
    expect(sidebarStateCookie(true, "http:")).toBe(
      "sidebar_state=true; path=/; max-age=604800; SameSite=Lax",
    );
  });

  it("writes a collapsed state", () => {
    expect(sidebarStateCookie(false, "http:")).toContain(
      "sidebar_state=false;",
    );
  });

  it("adds Secure on https", () => {
    expect(sidebarStateCookie(true, "https:")).toBe(
      "sidebar_state=true; path=/; max-age=604800; SameSite=Lax; Secure",
    );
  });

  it("omits Secure on http", () => {
    expect(sidebarStateCookie(true, "http:")).not.toContain("Secure");
  });
});
