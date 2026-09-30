import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "./hero";

const html = renderToStaticMarkup(createElement(Hero));

describe("Hero", () => {
  it("has exactly one h1", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("shows the eyebrow", () => {
    expect(html).toContain("Client portal for small agencies");
  });

  it("offers both demo buttons", () => {
    expect(html).toMatch(/<button[^>]*value="agency"[^>]*>Try as agency</);
    expect(html).toMatch(/<button[^>]*value="client"[^>]*>Try as client</);
  });

  it("has the demo buttons as its only buttons", () => {
    expect(html.match(/<button[\s>]/g)).toHaveLength(2);
    // No link dressed as a button (the header carries Log in and Sign up).
    expect(html).not.toMatch(/<a[^>]*group\/button/);
    expect(html).not.toMatch(/<a[^>]*href="\/login"/);
  });

  it("points to the free signup with one quiet text link", () => {
    const links = html.match(/<a[^>]*href="\/signup"[^>]*>[^<]*<\/a>/g) ?? [];

    expect(links).toHaveLength(1);
    expect(links[0]).toContain("Or start free with your own workspace");
    // A finger has to hit it on a phone.
    expect(links[0]).toContain("min-h-11");
    // Above sm it still meets the 24px target size (WCAG 2.5.8).
    expect(links[0]).toContain("sm:min-h-6");
  });

  it("names the audience in the lead", () => {
    expect(html).toMatch(/agencies and freelancers/i);
  });
});
