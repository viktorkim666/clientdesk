import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ postUpdate: vi.fn() }));
vi.mock("./draft-client", () => ({
  streamDraft: vi.fn(),
  draftOutcomeStatusMessage: vi.fn(),
}));

import { UpdateForm } from "./update-form";

function render(plan: "free" | "pro") {
  return renderToStaticMarkup(
    createElement(UpdateForm, {
      workspaceId: "w",
      workspaceSlug: "acme",
      projectId: "p",
      plan,
      aiConfigured: true,
    }),
  );
}

describe("UpdateForm", () => {
  it("keeps the Pro badge and Upgrade link grouped with the Draft update button", () => {
    const html = render("free");
    const start = html.indexOf("Draft update</button>");
    const groupStart = html.lastIndexOf("<span", start);
    const group = html.slice(groupStart, html.indexOf("Upgrade</a>") + 12);

    expect(group).toMatch(/^<span[^>]*\bwhitespace-nowrap\b/);
    expect(group).toContain("Draft update");
    expect(group).toContain(">Pro</span>");
    expect(group).toContain('href="/w/acme/settings/billing"');
  });

  it("shows neither badge nor link on the Pro plan", () => {
    const html = render("pro");

    expect(html).not.toContain(">Upgrade</a>");
    expect(html).not.toContain(">Pro</span>");
  });
});
