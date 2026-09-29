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

  it("links Start free to /signup and Log in to /login", () => {
    expect(html).toMatch(/<a[^>]*href="\/signup"[^>]*>Start free<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Log in<\/a>/);
  });

  it("names the audience in the lead", () => {
    expect(html).toMatch(/agencies and freelancers/i);
  });
});
