import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinalCta } from "./final-cta";

const html = renderToStaticMarkup(createElement(FinalCta));

describe("FinalCta", () => {
  it("has an h2 and the two actions as links", () => {
    expect(html.match(/<h2[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>Start free<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Log in<\/a>/);
  });

  it("reveals the panel, not the whole section", () => {
    expect(html).not.toMatch(/^<section[^>]*class="[^"]*\breveal\b/);
    expect(html.match(/class="[^"]*\breveal\b/g)).toHaveLength(1);
  });

  it("takes its colors from tokens rather than hard-coded oklch values", () => {
    expect(html).not.toContain("oklch(");
  });

  it("gives both links a panel-specific focus outline", () => {
    for (const link of html.match(/<a[^>]*>/g) ?? []) {
      expect(link).toContain("focus-visible:outline-solid");
      expect(link).toContain("focus-visible:outline-cta-foreground");
    }
  });
});
