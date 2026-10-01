import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "./workspace-switcher";

function render(workspaces: { name: string; slug: string }[], current: string) {
  return renderToStaticMarkup(
    createElement(WorkspaceSwitcher, { current, workspaces }),
  );
}

describe("WorkspaceSwitcher", () => {
  it("shows only the name when the user has one workspace", () => {
    const html = render(
      [{ name: "Northwind", slug: "northwind" }],
      "northwind",
    );

    expect(html).toContain("Northwind");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-haspopup");
  });

  it("prefixes the single name for screen readers and titles it for truncation", () => {
    const html = render(
      [{ name: "Northwind", slug: "northwind" }],
      "northwind",
    );

    expect(html).toContain('<span class="sr-only">Workspace: </span>');
    expect(html).toMatch(/<p[^>]*title="Northwind"/);
  });

  it("keeps the dropdown when the user has two workspaces", () => {
    const html = render(
      [
        { name: "Northwind", slug: "northwind" },
        { name: "Acme", slug: "acme" },
      ],
      "northwind",
    );

    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"/);
    expect(html).toContain("Northwind");
  });
});
