import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "./how-it-works";

const html = renderToStaticMarkup(createElement(HowItWorks));

describe("HowItWorks", () => {
  it("is the #how-it-works section", () => {
    expect(html).toMatch(/^<section[^>]*id="how-it-works"/);
    expect(html).not.toContain("scroll-mt-");
  });

  it("reveals the heading block and the step list, not the whole section", () => {
    expect(html).not.toMatch(/^<section[^>]*class="[^"]*\breveal\b/);
    expect(html.match(/class="[^"]*\breveal\b/g)).toHaveLength(2);
    expect(html).toMatch(/<ol[^>]*class="[^"]*\breveal\b/);
  });

  it("lists three steps in an ordered list", () => {
    expect(html).toMatch(/<ol[\s>]/);
    expect(html.match(/<li[\s>]/g)).toHaveLength(3);
  });
});
