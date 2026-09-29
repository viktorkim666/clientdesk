import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders a header with an h1 title", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { title: "Projects" }),
    );

    expect(html).toMatch(/^<header/);
    expect(html).toMatch(/<h1[^>]*>Projects<\/h1>/);
    expect(html).toContain("text-2xl font-semibold tracking-tight");
  });

  it("renders the description as muted text", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "Projects",
        description: "Everything in flight.",
      }),
    );

    expect(html).toMatch(
      /<p[^>]*text-muted-foreground[^>]*>Everything in flight\.<\/p>/,
    );
  });

  it("renders the actions slot and stacks on mobile", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, {
        title: "Projects",
        actions: createElement("button", null, "New project"),
      }),
    );

    expect(html).toContain("<button>New project</button>");
    expect(html).toContain("flex-col");
    expect(html).toContain("sm:flex-row");
  });

  it("omits the description and actions when not given", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { title: "Projects" }),
    );

    expect(html).not.toContain("<p");
    expect(html).not.toContain("<button");
  });
});
