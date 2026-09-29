import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectLoading from "./loading";

describe("ProjectLoading", () => {
  const html = renderToStaticMarkup(ProjectLoading());

  it("announces itself to assistive tech with role=status", () => {
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Loading project…<\/span>/);
  });

  it("renders skeleton blocks for the header, the updates and the files", () => {
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toContain("data-header");
    expect(html.match(/data-card/g)?.length).toBe(2);
  });
});
