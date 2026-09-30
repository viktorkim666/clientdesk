import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";
import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  it("renders a decorative 24x24 svg", () => {
    const html = renderToStaticMarkup(createElement(LogoMark));

    expect(html).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });

  it("draws a tile and two cards", () => {
    const html = renderToStaticMarkup(createElement(LogoMark));

    expect(html.match(/<rect /g)).toHaveLength(3);
  });

  it("fills the tile with the primary color and the cards with white in every theme", () => {
    const html = renderToStaticMarkup(createElement(LogoMark));

    expect(html).toContain("fill-primary");
    expect(html).not.toContain("fill-primary-foreground");
    expect(html.match(/fill-white/g)).toHaveLength(2);
    expect(html).toContain('opacity="0.45"');
  });

  it("passes className to the svg", () => {
    const html = renderToStaticMarkup(
      createElement(LogoMark, { className: "size-7" }),
    );

    expect(html).toMatch(/^<svg[^>]*class="size-7"/);
  });
});

describe("BrandMark", () => {
  it("keeps its accessible name and wordmark", () => {
    const html = renderToStaticMarkup(createElement(BrandMark));

    expect(html).toContain('aria-label="Clientdesk home"');
    expect(html).toContain("Clientdesk</a>");
  });

  it("renders the logo mark instead of a Lucide icon", () => {
    const html = renderToStaticMarkup(createElement(BrandMark));

    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain("lucide");
  });
});
