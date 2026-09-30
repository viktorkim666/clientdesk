import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageBackdrop } from "./page-backdrop";

describe("PageBackdrop", () => {
  it("is decorative and hidden from assistive technology", () => {
    const html = renderToStaticMarkup(createElement(PageBackdrop));

    expect(html).toMatch(/^<div[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/<(a|button|input|img|p|h\d)\b/);
  });

  it("reuses the landing glow and grid", () => {
    const html = renderToStaticMarkup(createElement(PageBackdrop));

    expect(html).toContain("landing-glow");
    expect(html).toContain("landing-grid");
  });

  it("sits behind the page content without taking part in layout", () => {
    const html = renderToStaticMarkup(createElement(PageBackdrop));

    expect(html).toMatch(/^<div[^>]*class="[^"]*\babsolute\b/);
    expect(html).toContain(" -z-10 ");
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bpointer-events-none\b/);
  });
});
