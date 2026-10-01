import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ postUpdate: vi.fn() }));
vi.mock("./draft-client", () => ({
  streamDraft: vi.fn(),
  draftOutcomeStatusMessage: vi.fn(),
}));

import { DemoLimitNotice, PostWarning, UpdateForm } from "./update-form";

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

  it("leaves the Draft update button usable before any demo limit", () => {
    const html = render("pro");
    const start = html.lastIndexOf("<button", html.indexOf("Draft update"));
    const button = html.slice(start, html.indexOf(">", start));

    expect(button).not.toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled(=|\s|$)/);
  });
});

describe("Draft update button limited state", () => {
  it("looks disabled at once and at every width, not faded in over a transition", () => {
    const html = render("pro");
    const start = html.lastIndexOf("<button", html.indexOf("Draft update"));
    const button = html.slice(start, html.indexOf(">", start));
    const classes = button.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

    expect(classes).toContain("aria-disabled:opacity-50");
    expect(classes).toContain("aria-disabled:cursor-not-allowed");
    expect(classes).toContain("aria-disabled:transition-none");
  });
});

describe("DemoLimitNotice", () => {
  it("is a polite status, not an alert, so it does not interrupt", () => {
    const html = renderToStaticMarkup(
      createElement(DemoLimitNotice, { reason: "sandbox", id: "limit-note" }),
    );

    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('id="limit-note"');
  });

  it("reads as a callout in the foreground color, next to the badge", () => {
    const html = renderToStaticMarkup(
      createElement(DemoLimitNotice, { reason: "budget", id: "n" }),
    );
    const classes = html.match(/^<p[^>]*class="([^"]*)"/)?.[1].split(" ") ?? [];

    expect(classes).toContain("text-foreground");
    expect(classes).toContain("bg-muted");
    expect(classes).toContain("rounded-md");
    expect(classes).not.toContain("text-muted-foreground");
    expect(html).toContain("Sample draft");
    expect(html).toContain("used up for today");
  });

  it("draws the badge on the page background with a border, so it stands out from the strip", () => {
    const html = renderToStaticMarkup(
      createElement(DemoLimitNotice, { reason: "budget", id: "n" }),
    );
    const badge = html.match(/<span[^>]*>Sample draft<\/span>/)?.[0] ?? "";
    const classes = badge.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

    expect(classes).toContain("bg-background");
    expect(classes).toContain("border-border");
    expect(classes).not.toContain("bg-secondary");
  });
});

describe("PostWarning", () => {
  it("uses the warning token pair instead of a low-contrast amber", () => {
    const html = renderToStaticMarkup(
      createElement(PostWarning, { message: "Posted, but email failed" }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Posted, but email failed");
    expect(html).toContain("bg-warning");
    expect(html).toContain("text-warning-foreground");
    expect(html).not.toContain("amber");
  });
});
