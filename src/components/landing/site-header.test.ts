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

  it("labels the inline section nav", () => {
    expect(html).toMatch(/<nav[^>]*aria-label="Page sections"/);
  });

  it("hides the anchors below md", () => {
    expect(html).toMatch(/<nav[^>]*hidden[^>]*md:flex/);
  });

  it("hides the header Log in below md, where the menu holds it", () => {
    expect(html).toMatch(/<a[^>]*max-md:hidden[^>]*href="\/login"/);
    expect(html).not.toMatch(/<a[^>]*max-md:hidden[^>]*href="\/signup"/);
  });

  it("links Log in to /login and Sign up to /signup", () => {
    expect(hrefOf("Log in")).toBe("/login");
    expect(hrefOf("Sign up")).toBe("/signup");
  });

  it("offers a menu button below md with a static name and a collapsed state", () => {
    const button = html.match(/<button[^>]*aria-label="Menu"[^>]*>/)?.[0] ?? "";

    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain("md:hidden");
    expect(button).toMatch(/size-11/);
  });

  it("keeps the theme toggle in the header from md up only", () => {
    expect(html).toMatch(
      /<div[^>]*max-md:hidden[^>]*><button[^>]*aria-label="Theme"/,
    );
  });

  it("does not render the menu panel while it is closed", () => {
    expect(html).not.toContain('role="dialog"');
  });
});
