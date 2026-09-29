import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleBadge } from "./role-badge";

describe("RoleBadge", () => {
  it.each([
    ["owner", "Owner"],
    ["member", "Member"],
    ["client", "Client"],
  ] as const)("renders %s as %s", (role, label) => {
    const html = renderToStaticMarkup(createElement(RoleBadge, { role }));

    expect(html).toContain(`>${label}<`);
  });
});
