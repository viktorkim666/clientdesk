import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("./actions", () => ({ registerFile: vi.fn() }));

import { FileUploader } from "./file-uploader";

function render() {
  return renderToStaticMarkup(
    createElement(FileUploader, {
      workspaceId: "w",
      workspaceSlug: "acme",
      projectId: "p",
    }),
  );
}

function tag(html: string, name: string) {
  return html.match(new RegExp(`<${name}[^>]*>`))?.[0] ?? "";
}

describe("FileUploader", () => {
  it("keeps a visually hidden, focusable native file input", () => {
    const input = tag(render(), "input");

    expect(input).toContain('type="file"');
    const classes = input.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(classes).toContain("sr-only");
    expect(classes).toContain("peer");
    expect(input).not.toContain("hidden=");
    expect(input).not.toContain('tabindex="-1"');
  });

  it("labels the input with a visible label whose text is its accessible name", () => {
    const html = render();
    const id = tag(html, "input").match(/id="([^"]+)"/)?.[1];

    expect(id).toBeTruthy();
    expect(html).toMatch(
      new RegExp(`<label[^>]*for="${id}"[^>]*>[^]*Upload a file[^]*</label>`),
    );
    expect(tag(html, "input")).not.toContain("aria-label");
  });

  it("draws the label as a dashed zone with an upload icon and a focus ring", () => {
    const html = render();
    const label = tag(html, "label");

    expect(label).toContain("border-dashed");
    expect(label).toContain("peer-focus-visible:ring-3");
    expect(html).toContain("lucide-upload");
    expect(html).toMatch(/<svg[^>]*lucide-upload[^>]*aria-hidden="true"/);
  });

  it("states the real size and type limits in a hint linked to the input", () => {
    const html = render();
    const hintId = tag(html, "input").match(/aria-describedby="([^"]+)"/)?.[1];

    expect(hintId).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${hintId}"[^>]*>[^<]*10 MB[^<]*<`));
    expect(html).toContain("PDF");
  });

  it("keeps a persistent, empty status region for upload announcements", () => {
    const html = render();

    expect(html).toMatch(/<p[^>]*role="status"[^>]*><\/p>/);
  });

  it("does not use disabled on the input, so a pending upload keeps focus", () => {
    const input = tag(render(), "input");

    expect(input).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(input).not.toContain('aria-disabled="true"');
  });

  it("does not show a pending label or an error before anything happens", () => {
    const html = render();

    expect(html).not.toContain("Uploading");
    expect(html).not.toContain('role="alert"');
  });
});
