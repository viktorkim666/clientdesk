import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ inviteMember: vi.fn() }));

import { InviteMemberDialog } from "./invite-member-dialog";

// The button classes contain "disabled:" variants, so match the attribute itself.
const DISABLED_ATTRIBUTE = /<button[^>]*\sdisabled(=""|\s|>)/;

function render(props: { isDemo?: boolean; actingRole?: "owner" | "client" }) {
  return renderToStaticMarkup(
    createElement(InviteMemberDialog, {
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      workspaceSlug: "acme",
      workspaceName: "Acme Agency",
      actingRole: props.actingRole ?? "owner",
      clients: [],
      isDemo: props.isDemo ?? false,
    }),
  );
}

describe("InviteMemberDialog", () => {
  it("renders an enabled Invite button outside a sandbox, with no note", () => {
    const html = render({});

    expect(html).toMatch(/<button[^>]*>Invite<\/button>/);
    expect(html).not.toMatch(DISABLED_ATTRIBUTE);
    expect(html).not.toContain("demo workspace");
  });

  it("marks the Invite button aria-disabled in a sandbox, so it stays focusable, and says why in visible text", () => {
    const html = render({ isDemo: true });

    expect(html).toMatch(
      /<button[^>]*aria-disabled="true"[^>]*>Invite<\/button>/,
    );
    expect(html).not.toMatch(DISABLED_ATTRIBUTE);
    expect(html).toContain("Invites are turned off in the demo workspace.");
  });

  it("styles the disabled button as a neutral outline with the standard disabled opacity", () => {
    // The filled primary at half opacity reads as washed-out indigo in both
    // themes (white on pale indigo in light, dark on dim indigo in dark).
    const button = /<button[^>]*>Invite<\/button>/.exec(
      render({ isDemo: true }),
    )?.[0];

    expect(button).toContain("aria-disabled:opacity-50");
    expect(button).toContain("border-border");
    expect(button).not.toContain("bg-primary");
  });

  it("ties the note to the disabled button", () => {
    const html = render({ isDemo: true });
    const describedBy = /<button[^>]*aria-describedby="([^"]+)"/.exec(
      html,
    )?.[1];

    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("renders nothing for a role that cannot invite, sandbox or not", () => {
    expect(render({ actingRole: "client", isDemo: true })).toBe("");
  });
});
