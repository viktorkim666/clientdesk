import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

function render(status: "active" | "on_hold" | "done"): string {
  return renderToStaticMarkup(createElement(StatusBadge, { status }));
}

describe("StatusBadge", () => {
  it.each([
    ["active", "Active", "lucide-circle-dot", "bg-success"],
    ["on_hold", "On hold", "lucide-circle-pause", "bg-warning"],
    ["done", "Done", "lucide-circle-check", "bg-muted"],
  ] as const)(
    "renders %s with text, icon and tone",
    (status, text, icon, tone) => {
      const html = render(status);

      expect(html).toContain(text);
      expect(html).toContain(icon);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(tone);
    },
  );
});
