import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ postComment: vi.fn() }));

import { CommentForm, commentReplyId } from "./comment-form";

const html = renderToStaticMarkup(
  createElement(CommentForm, {
    workspaceId: "w",
    workspaceSlug: "acme",
    projectId: "p",
    updateId: "u1",
    authorName: "Dana",
  }),
);

function replyButton(): string {
  return html.match(/<button[^>]*id="comment-reply-u1"[^>]*>/)?.[0] ?? "";
}

describe("CommentForm", () => {
  it("gives the reply button a deterministic id", () => {
    expect(commentReplyId("u1")).toBe("comment-reply-u1");
  });

  it("names the Reply button after the update's author, starting with Reply", () => {
    expect(replyButton()).toContain('aria-label="Reply to Dana&#x27;s update"');
  });

  it("gives the textarea a label that names the update's author", () => {
    expect(html).toMatch(
      /<label[^>]*for="comment-body-u1"[^>]*>Write a reply to Dana&#x27;s update<\/label>/,
    );
  });

  it("keeps an always-present polite status region outside the form", () => {
    expect(html).toMatch(
      /<p[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/p>/,
    );
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("<form"));
  });

  it("does not disable the submit button, so focus survives a pending post", () => {
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(submit).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(submit).toContain('aria-disabled="false"');
  });

  it("starts collapsed behind a Reply button", () => {
    const button = replyButton();

    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="comment-form-u1"');
    expect(html).toMatch(/<button[^>]*id="comment-reply-u1"[^>]*>[^]*?Reply/);
  });

  it("keeps the form in the page but hidden until it is expanded", () => {
    expect(html).toMatch(/<form[^>]*id="comment-form-u1"[^>]*hidden/);
    expect(html).toContain('id="comment-body-u1"');
  });

  it("offers Cancel next to the submit button", () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Cancel<\/button>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Comment<\/button>/);
  });

  it("gives the Reply button a 44px target on phones", () => {
    expect(replyButton()).toMatch(/max-sm:min-h-11|max-sm:h-11/);
  });
});
