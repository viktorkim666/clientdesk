import { describe, expect, it } from "vitest";
import { parseSandboxBilling } from "@/lib/demo/sandbox-billing";

describe("parseSandboxBilling", () => {
  it("is null outside a sandbox, when the function returns no row", () => {
    expect(parseSandboxBilling({ data: [], error: null })).toBeNull();
  });

  it("is null when there is no data and no error", () => {
    expect(parseSandboxBilling({ data: null, error: null })).toBeNull();
  });

  it("is pro with the Free workspace slug on the sandbox's Pro workspace", () => {
    expect(
      parseSandboxBilling({
        data: [{ kind: "pro", free_slug: "northwind-labs-ab12" }],
        error: null,
      }),
    ).toEqual({ kind: "pro", freeSlug: "northwind-labs-ab12" });
  });

  it("is pro without a slug when the Free workspace is gone or unreadable", () => {
    expect(
      parseSandboxBilling({
        data: [{ kind: "pro", free_slug: null }],
        error: null,
      }),
    ).toEqual({ kind: "pro", freeSlug: null });
  });

  it("is free on the sandbox's Free workspace", () => {
    expect(
      parseSandboxBilling({
        data: [{ kind: "free", free_slug: null }],
        error: null,
      }),
    ).toEqual({ kind: "free" });
  });

  it("throws when the lookup fails, so a failed check never reads as no sandbox", () => {
    expect(() =>
      parseSandboxBilling({ data: null, error: new Error("boom") }),
    ).toThrow("boom");
  });

  it("throws on a kind it does not know instead of guessing a plan", () => {
    expect(() =>
      parseSandboxBilling({
        data: [{ kind: "enterprise", free_slug: null }],
        error: null,
      }),
    ).toThrow(/enterprise/);
  });
});
