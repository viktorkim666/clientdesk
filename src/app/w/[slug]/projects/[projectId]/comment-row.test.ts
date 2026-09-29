import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ deleteComment: vi.fn() }));

import { CommentRow } from "./comment-row";

function render(canDelete: boolean) {
  return renderToStaticMarkup(
    createElement("ul", null, [
      createElement(CommentRow, {
        key: "c",
        workspaceId: "w",
        workspaceSlug: "acme",
        projectId: "p",
        updateId: "u1",
        comment: {
          id: "c1",
          body: "Nice",
          createdAt: "2026-03-03T09:00:00Z",
          createdLabel: "3 hours ago",
          createdTitle: "Mar 3, 2026",
          authorId: "u1",
          authorName: "Ada Lovelace",
        },
        canDelete,
      }),
    ]),
  );
}

describe("CommentRow", () => {
  it("shows the author, the relative time and the body", () => {
    const html = render(false);
    expect(html).toContain("Ada Lovelace");
    expect(html).toMatch(
      /<time[^>]*title="Mar 3, 2026"[^>]*>3 hours ago<\/time>/,
    );
    expect(html).toContain("Nice");
    expect(html).not.toContain("Delete comment");
  });

  it("names the delete button after the comment's author, starting with the visible word", () => {
    const html = render(true);
    expect(html).toMatch(
      /<button[^>]*aria-label="Delete comment by Ada Lovelace"[^>]*>/,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toContain("×");
  });

  it("asks for confirmation instead of deleting straight away", () => {
    const html = render(true);
    const button = html.match(/<button[^>]*>/)?.[0] ?? "";

    // A dialog trigger, and no dialog content until it is opened.
    expect(button).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Delete this comment?");
  });

  it("keeps the delete button out of the column that holds the comment body", () => {
    const html = render(true);
    const afterBody = html.slice(html.indexOf("</p>"), html.indexOf("<button"));

    expect(html.indexOf("</p>")).toBeGreaterThan(-1);
    expect(html.indexOf("<button")).toBeGreaterThan(html.indexOf("</p>"));
    // The body's column closes before the button starts.
    expect(afterBody).toContain("</div>");
  });

  it("hides the avatar through the component, without a wrapper", () => {
    const html = render(false);

    expect(html).toMatch(
      /<li[^>]*><span[^>]*data-slot="avatar"[^>]*aria-hidden="true"/,
    );
  });
});
