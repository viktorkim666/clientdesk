import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceLoading from "./loading";

describe("WorkspaceLoading", () => {
  const html = renderToStaticMarkup(WorkspaceLoading());

  it("announces itself to assistive tech with role=status", () => {
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Loading workspace…<\/span>/);
  });

  it("renders skeleton blocks in the dashboard layout", () => {
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toContain("sm:grid-cols-3");
    expect(html).toContain("lg:grid-cols-5");
  });
});
