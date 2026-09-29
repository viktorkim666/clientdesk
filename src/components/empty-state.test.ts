import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FolderKanban } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title, description and a decorative icon tile", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: FolderKanban,
        title: "No projects yet",
        description: "Create a project to start posting updates.",
      }),
    );

    expect(html).toContain("No projects yet");
    expect(html).toContain("Create a project to start posting updates.");
    expect(html).toContain("lucide-folder-kanban");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("bg-sidebar-accent");
  });

  it("does not render a heading, so the page keeps one h1 and its order", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: FolderKanban,
        title: "No projects yet",
        description: "Create a project.",
      }),
    );

    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("renders the action when given", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: FolderKanban,
        title: "No projects yet",
        description: "Create a project.",
        action: createElement("button", null, "New project"),
      }),
    );

    expect(html).toContain("<button>New project</button>");
  });

  it("omits the action slot when not given", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: FolderKanban,
        title: "No projects yet",
        description: "Create a project.",
      }),
    );

    expect(html).not.toContain("<button");
    expect(html).not.toContain("empty-content");
  });

  it("uses the accent tint by default and the destructive tint for the danger tone", () => {
    const base = {
      icon: FolderKanban,
      title: "Something went wrong",
      description: "Try again.",
    };
    const neutral = renderToStaticMarkup(createElement(EmptyState, base));
    const danger = renderToStaticMarkup(
      createElement(EmptyState, { ...base, tone: "danger" }),
    );

    expect(neutral).toContain("bg-sidebar-accent");
    expect(neutral).not.toContain("bg-destructive/10");
    expect(danger).toContain("bg-destructive/10");
    expect(danger).toContain("text-destructive");
    expect(danger).not.toContain("bg-sidebar-accent");
  });
});
