import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

import { MemberRow } from "./member-row";

function render() {
  return renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        createElement(MemberRow, {
          workspaceId: "w",
          workspaceSlug: "acme",
          actingRole: "owner",
          member: {
            userId: "u1",
            role: "member",
            fullName: "Priya Nair",
            clientName: null,
          },
          isLastOwner: false,
        }),
      ),
    ),
  );
}

describe("MemberRow", () => {
  it("does not put aria-invalid on the Remove button (unsupported on role=button)", () => {
    const html = render();
    const remove =
      html.match(/<button[^>]*aria-label="Remove Priya Nair"[^>]*>/)?.[0] ?? "";

    expect(remove).not.toBe("");
    expect(remove).not.toMatch(/\saria-invalid=/);
  });
});
