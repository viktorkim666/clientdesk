import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoButtons } from "./demo-buttons";

describe("DemoButtons", () => {
  const html = renderToStaticMarkup(
    createElement(DemoButtons, { variant: "hero" }),
  );

  it("has a Try as agency and a Try as client submit button", () => {
    // Attribute order is React's, so match each button on its own.
    for (const [role, label] of [
      ["agency", "Try as agency"],
      ["client", "Try as client"],
    ]) {
      const button = html
        .match(/<button[^>]*>[^<]*<\/button>/g)
        ?.find((candidate) => candidate.endsWith(`>${label}</button>`));

      expect(button, label).toBeDefined();
      expect(button).toContain('type="submit"');
      expect(button).toContain('name="role"');
      expect(button).toContain(`value="${role}"`);
    }
  });

  it("keeps both buttons enabled and announces progress through an empty status region", () => {
    expect(html).not.toMatch(/<button[^>]*\sdisabled(=""|\s|>)/);
    expect(html).toMatch(
      /<p[^>]*role="status"[^>]*class="[^"]*sr-only[^"]*"[^>]*><\/p>|<p[^>]*class="[^"]*sr-only[^"]*"[^>]*role="status"[^>]*><\/p>/,
    );
  });

  it("renders no error before anything is submitted", () => {
    expect(html).not.toContain('role="alert"');
  });
});
