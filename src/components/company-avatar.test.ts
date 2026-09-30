import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyAvatar } from "./company-avatar";

describe("CompanyAvatar", () => {
  it("renders a building icon instead of initials", () => {
    const html = renderToStaticMarkup(createElement(CompanyAvatar));

    expect(html).toContain("<svg");
    expect(html).toContain("lucide-building-2");
    expect(html).not.toMatch(/>[A-Z]{1,2}</);
  });

  it("uses the same tint and round shape as UserAvatar", () => {
    const html = renderToStaticMarkup(createElement(CompanyAvatar));

    expect(html).toContain("bg-sidebar-accent");
    expect(html).toContain("text-sidebar-accent-foreground");
    expect(html).toContain("rounded-full");
  });

  it("hides itself from assistive technology", () => {
    const html = renderToStaticMarkup(createElement(CompanyAvatar));

    expect(html).toMatch(/^<span[^>]*aria-hidden="true"/);
  });

  it("supports the sm size and defaults to the default size", () => {
    expect(
      renderToStaticMarkup(createElement(CompanyAvatar, { size: "sm" })),
    ).toContain('data-size="sm"');
    expect(renderToStaticMarkup(createElement(CompanyAvatar))).toContain(
      'data-size="default"',
    );
  });

  it("passes a custom class name through", () => {
    const html = renderToStaticMarkup(
      createElement(CompanyAvatar, { className: "shrink-0" }),
    );

    expect(html).toContain("shrink-0");
  });
});
