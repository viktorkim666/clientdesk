import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";

function render(fullName: string | null) {
  return renderToStaticMarkup(
    createElement(
      SidebarProvider,
      null,
      createElement(NavUser, { email: "maya@northwind.test", fullName }),
    ),
  );
}

function trigger(html: string) {
  return (
    html.match(/<button[^>]*aria-haspopup="menu"[^>]*>[^]*?<\/button>/)?.[0] ??
    ""
  );
}

describe("NavUser trigger", () => {
  it("does not override its visible text with an aria-label (WCAG 2.5.3)", () => {
    expect(trigger(render("Maya Chen"))).not.toContain("aria-label");
  });

  it("starts the accessible name with a screen-reader-only 'Account' prefix", () => {
    const button = trigger(render("Maya Chen"));

    expect(button).toMatch(/<span[^>]*\bsr-only\b[^>]*>Account: <\/span>/);
    expect(button.replace(/<[^>]+>/g, "")).toContain("Account: Maya Chen");
    expect(button).toContain("maya@northwind.test");
  });

  it("names the account by email when there is no full name", () => {
    const button = trigger(render(null));

    expect(button.replace(/<[^>]+>/g, "")).toContain(
      "Account: maya@northwind.test",
    );
  });
});
