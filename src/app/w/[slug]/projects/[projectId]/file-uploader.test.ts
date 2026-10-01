import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("./actions", () => ({ registerFile: vi.fn() }));

import { FileUploader, UploadError } from "./file-uploader";

function render(demoUploadsUsed: number | null = null) {
  return renderToStaticMarkup(
    createElement(FileUploader, {
      workspaceId: "w",
      workspaceSlug: "acme",
      projectId: "p",
      demoUploadsUsed,
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

  describe("in a demo sandbox", () => {
    it("shows the demo limits in the drop zone hint, linked to the input", () => {
      const html = render(0);
      const hintId = tag(html, "input").match(
        /aria-describedby="([^"]+)"/,
      )?.[1];

      expect(hintId).toBeTruthy();
      expect(html).toMatch(
        new RegExp(
          `id="${hintId}"[^>]*>Demo: up to 5 files, 2 MB each, images or PDF<`,
        ),
      );
      expect(html).not.toContain("10 MB");
    });

    it("limits the file picker to the allowed types", () => {
      const input = tag(render(0), "input");

      expect(input).toContain(
        'accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"',
      );
    });

    it("explains in the hint once all 5 uploads are used, without promising a freed slot", () => {
      const html = render(5);
      const hintId = tag(html, "input").match(
        /aria-describedby="([^"]+)"/,
      )?.[1];

      expect(html).toMatch(
        new RegExp(
          `id="${hintId}"[^>]*>Demo limit reached: 5 uploads. Uploads are turned off for the rest of this demo.<`,
        ),
      );
      expect(html).not.toMatch(/delete one of yours/i);
    });

    it("marks the input aria-disabled, but still focusable, once the limit is reached", () => {
      const input = tag(render(5), "input");

      expect(input).toContain('aria-disabled="true"');
      expect(input).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(input).not.toContain('tabindex="-1"');
    });

    it("keeps the input enabled below the limit", () => {
      expect(tag(render(4), "input")).not.toContain('aria-disabled="true"');
    });

    it("balances the hint text so PDF does not wrap alone", () => {
      const html = render(0);
      const hintId = tag(html, "input").match(/id="([^"]+)"/)?.[1];
      const describedBy = tag(html, "input").match(
        /aria-describedby="([^"]+)"/,
      )?.[1];

      expect(hintId).toBeTruthy();
      expect(
        tag(html.slice(html.indexOf(`id="${describedBy}"`) - 6), "span"),
      ).toContain("text-balance");
    });

    it("keeps the normal hint and no accept filter outside a sandbox", () => {
      const html = render(null);

      expect(html).toContain("10 MB");
      expect(html).not.toContain("Demo");
      expect(tag(html, "input")).not.toContain("accept=");
    });
  });
});

describe("UploadError", () => {
  function renderError(announceOnly: boolean) {
    return renderToStaticMarkup(
      createElement(UploadError, {
        id: "err",
        message: "Something went wrong",
        announceOnly,
      }),
    );
  }

  it("shows a real error as a visible red alert", () => {
    const html = renderError(false);
    const classes = html.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

    expect(html).toContain('role="alert"');
    expect(html).toContain('id="err"');
    expect(html).toContain(">Something went wrong<");
    expect(classes).toContain("text-destructive");
    expect(classes).not.toContain("sr-only");
  });

  it("keeps an announce-only error for screen readers and hides the visible copy", () => {
    const html = renderError(true);
    const classes = html.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];

    expect(html).toContain('role="alert"');
    expect(html).toContain(">Something went wrong<");
    expect(classes).toContain("sr-only");
    expect(classes).not.toContain("text-destructive");
  });
});
