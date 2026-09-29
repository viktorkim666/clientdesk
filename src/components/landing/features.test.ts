import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Features } from "./features";

const html = renderToStaticMarkup(createElement(Features));

describe("Features", () => {
  it("is the #features section with one h2", () => {
    expect(html).toMatch(/^<section[^>]*id="features"/);
    expect(html.match(/<h2[\s>]/g)).toHaveLength(1);
  });

  it("has four feature rows, each with an h3", () => {
    expect(html.match(/<h3[\s>]/g)).toHaveLength(4);
    expect(html.match(/<article[\s>]/g)).toHaveLength(4);
  });

  it("covers the four capabilities", () => {
    for (const title of [
      "Roles and access",
      "Files and conversation",
      "AI update drafts",
      "Billing",
    ]) {
      expect(html).toMatch(new RegExp(`<h3[^>]*>${title}</h3>`));
    }
  });

  it("reveals the heading block and each row, not the whole section", () => {
    expect(html).not.toMatch(/^<section[^>]*class="[^"]*\breveal\b/);
    expect(html.match(/class="[^"]*\breveal\b/g)).toHaveLength(5);
    expect(html.match(/<article[^>]*class="[^"]*\breveal\b/g)).toHaveLength(4);
  });

  it("leaves the anchor offset to the page scroll padding", () => {
    expect(html).not.toContain("scroll-mt-");
  });

  it("has no hover lift on the preview cards", () => {
    expect(html).not.toContain("landing-card");
  });

  it("names no prices", () => {
    expect(html).not.toMatch(/\$\d/);
  });
});
