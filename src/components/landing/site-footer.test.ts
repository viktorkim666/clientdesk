import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "./site-footer";

const html = renderToStaticMarkup(createElement(SiteFooter));

describe("SiteFooter", () => {
  it("is a footer landmark", () => {
    expect(html).toMatch(/^<footer/);
  });

  it("opens the GitHub repo in a new tab safely", () => {
    const link = html.match(/<a[^>]*>Source on GitHub.*?<\/a>/)?.[0] ?? "";
    expect(link).toContain('href="https://github.com/viktorkim666/clientdesk"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it("announces that the GitHub link opens in a new tab", () => {
    expect(html).toMatch(
      /Source on GitHub<span class="sr-only"> \(opens in a new tab\)<\/span><\/a>/,
    );
  });

  describe("year", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows the current year", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2031-06-15T12:00:00Z"));
      const dated = renderToStaticMarkup(createElement(SiteFooter));
      expect(dated).toContain("© 2031 Clientdesk");
    });
  });
});
