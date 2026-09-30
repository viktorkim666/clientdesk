import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoBanner } from "./demo-banner";

type Props = {
  label: string;
  shortLabel: string;
  switchLabel: string | null;
  switchShortLabel: string | null;
};

const OWNER: Props = {
  label: "Viewing as Maya Chen (agency owner)",
  shortLabel: "Maya Chen, agency",
  switchLabel: "Switch to client view",
  switchShortLabel: "Client view",
};

function render(props: Props) {
  return renderToStaticMarkup(createElement(DemoBanner, props));
}

// The class of the element whose own text is exactly `text`.
function classOf(html: string, text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    html.match(new RegExp(`<[a-z]+ class="([^"]*)">${escaped}<`))?.[1] ?? ""
  );
}

describe("DemoBanner", () => {
  const html = render(OWNER);

  it("is a labelled region", () => {
    expect(html).toMatch(/<section[^>]*aria-label="Demo workspace"/);
  });

  it("says it is a demo, who is viewing, and when it resets", () => {
    expect(html).toContain("Demo workspace");
    expect(html).toContain("Viewing as Maya Chen (agency owner)");
    expect(html).toContain("Resets within 24 hours");
  });

  it("offers the switch as a submit button", () => {
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain("Switch to client view");
  });

  it("omits the switch when there is no other view", () => {
    const withoutSwitch = render({
      label: "Viewing as Leo Park (agency member)",
      shortLabel: "Leo Park, agency",
      switchLabel: null,
      switchShortLabel: null,
    });

    expect(withoutSwitch).not.toContain("<button");
    expect(withoutSwitch).not.toContain("<form");
  });
});

describe("DemoBanner on a phone", () => {
  const html = render(OWNER);

  it("shows one short line: Demo, then the name and side", () => {
    expect(html).toContain("Maya Chen, agency");
    expect(classOf(html, "Maya Chen, agency")).toContain("sm:hidden");
    expect(classOf(html, "Viewing as Maya Chen (agency owner)")).toContain(
      "hidden sm:inline",
    );
    expect(classOf(html, "Demo workspace")).toContain("hidden sm:inline");
    expect(html).toMatch(/class="[^"]*sm:hidden[^"]*">Demo</);
  });

  it("keeps the reset note visible on a phone, in a text color that passes contrast", () => {
    const note = classOf(html, "Resets within 24 hours");

    expect(note).not.toContain("hidden");
    expect(note).toContain("text-foreground/70");
    expect(note).not.toContain("text-muted-foreground");
  });

  it("wraps a long name instead of clipping it", () => {
    const line = html.match(
      /<p class="([^"]*)"><span class="font-semibold"/,
    )?.[1];

    expect(line).toContain("break-words");
    expect(line).not.toContain("truncate");
  });

  it("has an empty status region ready to announce a switch in progress", () => {
    expect(html).toMatch(
      /<p[^>]*role="status"[^>]*class="[^"]*sr-only[^"]*"[^>]*><\/p>|<p[^>]*class="[^"]*sr-only[^"]*"[^>]*role="status"[^>]*><\/p>/,
    );
  });

  it("does not disable the switch button, so it keeps focus while pending", () => {
    expect(html).not.toMatch(/<button[^>]*\sdisabled(=""|\s|>)/);
  });

  it("keeps the whole banner on one row", () => {
    const section = html.match(/<section[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(section).toContain("flex");
    expect(section).not.toContain("flex-col");
  });

  it("shortens the button text but keeps the full name for screen readers", () => {
    // "Switch to " is read out but not shown, so the visible "Client view"
    // is part of the accessible name "Switch to client view" (WCAG 2.5.3).
    expect(html).toMatch(
      /<span class="sm:hidden"><span class="sr-only">Switch to <\/span>Client view<\/span>/,
    );
    expect(classOf(html, "Switch to client view")).toContain(
      "hidden sm:inline",
    );
  });
});
