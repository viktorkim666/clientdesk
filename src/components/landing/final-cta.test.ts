import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinalCta } from "./final-cta";

const html = renderToStaticMarkup(createElement(FinalCta));

describe("FinalCta", () => {
  it("has an h2 and one quiet link to the free signup", () => {
    expect(html.match(/<h2[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(
      /<a[^>]*href="\/signup"[^>]*>Or start free with your own workspace<\/a>/,
    );
    expect(html).not.toMatch(/<a[^>]*href="\/login"/);
  });

  it("keeps the signup link at least 24px tall above sm", () => {
    const link = html.match(/<a[^>]*href="\/signup"[^>]*>/)?.[0];

    expect(link).toContain("sm:min-h-6");
  });

  it("has the demo buttons as its only buttons", () => {
    expect(html.match(/<button[\s>]/g)).toHaveLength(2);
    expect(html).not.toMatch(/<a[^>]*group\/button/);
  });

  it("offers both demo buttons", () => {
    expect(html).toMatch(/<button[^>]*value="agency"[^>]*>Try as agency</);
    expect(html).toMatch(/<button[^>]*value="client"[^>]*>Try as client</);
  });

  it("reveals the panel, not the whole section", () => {
    expect(html).not.toMatch(/^<section[^>]*class="[^"]*\breveal\b/);
    expect(html.match(/class="[^"]*\breveal\b/g)).toHaveLength(1);
  });

  it("takes its colors from tokens rather than hard-coded oklch values", () => {
    expect(html).not.toContain("oklch(");
  });

  it("gives its link a panel-specific focus outline", () => {
    for (const link of html.match(/<a[^>]*>/g) ?? []) {
      expect(link).toContain("focus-visible:outline-solid");
      expect(link).toContain("focus-visible:outline-cta-foreground");
    }
  });
});
