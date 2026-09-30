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

  it("marks the row and every cell with explicit roles (its display is grid below sm)", () => {
    const html = render();

    expect(html.match(/<tr[^>]*role="row"/g)).toHaveLength(1);
    expect(html.match(/<td\b/g)).toHaveLength(4);
    expect(html.match(/<td[^>]*role="cell"/g)).toHaveLength(4);
  });
});
