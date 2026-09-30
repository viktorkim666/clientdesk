import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InviteLinkPanel } from "./invite-link-panel";

const INVITE_URL = "http://localhost:3000/invite/abc123";

function render() {
  return renderToStaticMarkup(
    createElement(InviteLinkPanel, { inviteUrl: INVITE_URL }),
  );
}

describe("InviteLinkPanel", () => {
  it("shows the absolute link in a read-only field with a label", () => {
    const html = render();

    expect(html).toContain(`value="${INVITE_URL}"`);
    expect(html).toMatch(/<input[^>]*readOnly=""|<input[^>]*readonly=""/i);
    expect(html).toMatch(
      /<label[^>]*for="invite-link"[^>]*>Invite link<\/label>/,
    );
    expect(html).toContain('id="invite-link"');
  });

  it("says that no email was sent", () => {
    expect(render()).toContain("No email was sent");
  });

  it("does not repeat the dialog title in its text", () => {
    expect(render()).not.toContain("The invitation is ready");
  });

  it("has a copy button with an accessible name", () => {
    const html = render();

    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="Copy invite link"|<button[^>]*aria-label="Copy invite link"[^>]*type="button"/,
    );
  });

  it("announces the copy result through an empty status region, without a redundant aria-live", () => {
    const html = render();

    expect(html).toMatch(/<p[^>]*role="status"[^>]*><\/p>/);
    expect(html).not.toContain("aria-live");
  });

  it("keeps the copy button 44px tall on a phone", () => {
    const button = /<button[^>]*aria-label="Copy invite link"[^>]*>/.exec(
      render(),
    )?.[0];

    expect(button).toContain("max-sm:h-11");
  });
});
