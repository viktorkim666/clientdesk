import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getInitials, UserAvatar } from "./user-avatar";

describe("getInitials", () => {
  it("uses the first letters of a two-word name", () => {
    expect(getInitials({ name: "Ada Lovelace" })).toBe("AL");
  });

  it("uses the first and last word of a longer name", () => {
    expect(getInitials({ name: "Ada Augusta King Lovelace" })).toBe("AL");
  });

  it("uses the first two letters of a one-word name", () => {
    expect(getInitials({ name: "madonna" })).toBe("MA");
  });

  it("collapses extra whitespace in a name", () => {
    expect(getInitials({ name: "  Ada   Lovelace " })).toBe("AL");
  });

  it("uses letters of the email local part", () => {
    expect(getInitials({ email: "ai-draft-owner@clientdesk.test" })).toBe("AI");
    expect(getInitials({ email: "bob@example.com" })).toBe("BO");
  });

  it("falls back to the raw local part when it has no letters", () => {
    expect(getInitials({ email: "1234@example.com" })).toBe("12");
  });

  it("prefers the name over the email", () => {
    expect(
      getInitials({ name: "Ada Lovelace", email: "bob@example.com" }),
    ).toBe("AL");
  });

  it("falls back to the email when the name is blank", () => {
    expect(getInitials({ name: "   ", email: "bob@example.com" })).toBe("BO");
  });

  it("keeps astral characters whole instead of splitting a surrogate pair", () => {
    expect(getInitials({ name: "😀 Smile" })).toBe("😀S");
    expect(getInitials({ name: "𝓐da" })).toBe("𝓐D");
    expect(getInitials({ name: "😀😀😀" })).toBe("😀😀");
  });

  it("returns a placeholder when nothing is given", () => {
    expect(getInitials({})).toBe("?");
  });
});

describe("UserAvatar", () => {
  it("renders initials with the sidebar accent tint", () => {
    const html = renderToStaticMarkup(
      createElement(UserAvatar, { name: "Ada Lovelace" }),
    );

    expect(html).toContain("AL");
    expect(html).toContain("bg-sidebar-accent");
    expect(html).toContain("text-sidebar-accent-foreground");
    expect(html).toContain("rounded-full");
  });

  it("hides itself from assistive technology", () => {
    const html = renderToStaticMarkup(
      createElement(UserAvatar, { name: "Ada Lovelace" }),
    );

    expect(html).toMatch(/^<span[^>]*aria-hidden="true"/);
  });

  it("supports the sm size", () => {
    const html = renderToStaticMarkup(
      createElement(UserAvatar, { email: "bob@example.com", size: "sm" }),
    );

    expect(html).toContain('data-size="sm"');
    expect(html).toContain("BO");
  });

  it("defaults to the default size", () => {
    const html = renderToStaticMarkup(
      createElement(UserAvatar, { email: "bob@example.com" }),
    );

    expect(html).toContain('data-size="default"');
  });
});
