import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./site-header";

const html = renderToStaticMarkup(createElement(SiteHeader));

function hrefOf(name: string): string | undefined {
  const match = html.match(
    new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${name}</a>`),
  );
  return match?.[1];
}

describe("SiteHeader", () => {
  it("is a header landmark with a sticky blurred background", () => {
    expect(html).toMatch(/^<header/);
    expect(html).toContain("sticky");
    expect(html).toContain("backdrop-blur");
    expect(html).toContain("border-b");
  });

  it("links the anchors to the page sections", () => {
    expect(hrefOf("Features")).toBe("#features");
    expect(hrefOf("How it works")).toBe("#how-it-works");
  });

  it("hides the anchors below md", () => {
    expect(html).toMatch(/<nav[^>]*hidden[^>]*md:flex/);
  });

  it("hides the header Log in below sm, where it overflows at 320px", () => {
    expect(html).toMatch(/<a[^>]*max-sm:hidden[^>]*href="\/login"/);
    expect(html).not.toMatch(/<a[^>]*max-sm:hidden[^>]*href="\/signup"/);
  });

  it("links Log in to /login and Sign up to /signup", () => {
    expect(hrefOf("Log in")).toBe("/login");
    expect(hrefOf("Sign up")).toBe("/signup");
  });
});
