import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectsLoading from "./loading";

describe("ProjectsLoading", () => {
  const html = renderToStaticMarkup(ProjectsLoading());

  it("announces itself to assistive tech with role=status", () => {
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Loading projects…<\/span>/);
  });

  it("renders skeleton blocks for the header and table rows", () => {
    expect(html).toContain('data-slot="skeleton"');
    expect(html.match(/data-row/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
