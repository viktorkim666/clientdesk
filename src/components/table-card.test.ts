import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableCard } from "./table-card";

describe("TableCard", () => {
  it("wraps its children in a bordered, rounded, clipped container", () => {
    const html = renderToStaticMarkup(
      createElement(TableCard, null, createElement("table", null)),
    );

    expect(html).toMatch(/^<div/);
    for (const token of [
      "rounded-xl",
      "border",
      "bg-card",
      "overflow-hidden",
    ]) {
      expect(html.split('"')[1]?.split(" ")).toContain(token);
    }
    expect(html).toContain("<table>");
  });

  it("styles the header row muted and pads cells consistently", () => {
    const html = renderToStaticMarkup(
      createElement(TableCard, null, createElement("table", null)),
    ).replaceAll("&amp;", "&");

    expect(html).toContain("[&_thead]:bg-muted/50");
    expect(html).toContain("[&_th]:px-2");
    expect(html).toContain("sm:[&_th]:px-4");
    expect(html).toContain("[&_td]:px-2");
    expect(html).toContain("sm:[&_td]:px-4");
    expect(html).toContain("[&_td]:py-3");
  });
});
