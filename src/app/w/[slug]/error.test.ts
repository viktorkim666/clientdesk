import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WorkspaceError from "./error";

function render(reset = vi.fn()) {
  return renderToStaticMarkup(
    createElement(WorkspaceError, { error: new Error("boom"), reset }),
  );
}

describe("WorkspaceError", () => {
  it("explains the failure in the same shape as the other empty states", () => {
    const html = render();

    expect(html).toContain("Something went wrong");
    expect(html).toContain(
      "This page couldn&#x27;t load. Try again, or come back later.",
    );
    expect(html).toContain('data-slot="empty"');
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("uses the danger tone for the icon tile", () => {
    expect(render()).toContain("bg-destructive/10");
  });

  it("offers a Try again button and not a heading of its own", () => {
    const html = render();

    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toMatch(/<h[1-6]/);
  });
});
