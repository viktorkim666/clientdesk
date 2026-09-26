import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/email/escape-html";

describe("escapeHtml", () => {
  it("escapes ampersand, angle brackets, double and single quotes", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("neutralizes a workspace name that tries to inject a tag", () => {
    const malicious = `<img src=x onerror=alert(1)>`;

    expect(escapeHtml(malicious)).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("neutralizes an attribute-breakout attempt in a URL", () => {
    const malicious = `https://example.com/"><script>alert(1)</script>`;

    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("<script>");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Acme Agency")).toBe("Acme Agency");
  });
});
