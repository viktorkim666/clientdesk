import { describe, expect, it } from "vitest";
import { buildActivityFeed } from "./activity";

const authorNames = new Map([
  ["u1", "Olivia Owner"],
  ["u2", "Mason Member"],
]);

function update(id: string, createdAt: string, authorId: string | null = "u1") {
  return {
    id,
    project_id: "p1",
    author_id: authorId,
    created_at: createdAt,
    projects: { name: "Website" },
  };
}
function comment(
  id: string,
  createdAt: string,
  authorId: string | null = "u2",
) {
  return {
    id,
    project_id: "p2",
    author_id: authorId,
    created_at: createdAt,
    projects: { name: "Brand" },
  };
}
function file(id: string, createdAt: string, uploadedBy: string | null = "u1") {
  return {
    id,
    project_id: "p1",
    uploaded_by: uploadedBy,
    name: `${id}.pdf`,
    created_at: createdAt,
    projects: { name: "Website" },
  };
}

function feed(input: Partial<Parameters<typeof buildActivityFeed>[0]> = {}) {
  return buildActivityFeed({
    updates: [],
    comments: [],
    files: [],
    authorNames,
    limit: 8,
    ...input,
  });
}

describe("buildActivityFeed", () => {
  it("returns an empty feed when every source is empty", () => {
    expect(feed()).toEqual([]);
  });

  it("merges the three sources newest first", () => {
    const items = feed({
      updates: [update("a", "2026-01-01T10:00:00Z")],
      comments: [comment("b", "2026-01-03T10:00:00Z")],
      files: [file("c", "2026-01-02T10:00:00Z")],
    });

    expect(items.map((item) => item.kind)).toEqual([
      "comment",
      "file",
      "update",
    ]);
  });

  it("orders by instant, not by string, when timestamps use different offsets", () => {
    const items = feed({
      updates: [update("a", "2026-01-01T12:00:00+02:00")],
      comments: [comment("b", "2026-01-01T11:00:00+00:00")],
    });

    expect(items.map((item) => item.kind)).toEqual(["comment", "update"]);
  });

  it("caps the feed at the given limit", () => {
    const updates = Array.from({ length: 12 }, (_, index) =>
      update(
        `u${index}`,
        `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      ),
    );

    const items = feed({ updates, limit: 8 });

    expect(items).toHaveLength(8);
    expect(items[0]?.createdAt).toBe("2026-01-12T00:00:00Z");
    expect(items[7]?.createdAt).toBe("2026-01-05T00:00:00Z");
  });

  it("honours a custom limit", () => {
    const items = feed({
      updates: [
        update("a", "2026-01-01T00:00:00Z"),
        update("b", "2026-01-02T00:00:00Z"),
      ],
      limit: 1,
    });

    expect(items.map((item) => item.createdAt)).toEqual([
      "2026-01-02T00:00:00Z",
    ]);
  });

  it("keeps ids unique when sources share the same row id", () => {
    const items = feed({
      updates: [update("same", "2026-01-01T00:00:00Z")],
      comments: [comment("same", "2026-01-02T00:00:00Z")],
      files: [file("same", "2026-01-03T00:00:00Z")],
    });

    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it("orders equal timestamps deterministically: updates, comments, files", () => {
    const at = "2026-01-01T00:00:00Z";
    const items = feed({
      files: [file("f", at)],
      comments: [comment("c", at)],
      updates: [update("u", at)],
    });

    expect(items.map((item) => item.kind)).toEqual([
      "update",
      "comment",
      "file",
    ]);
  });

  it("carries the project id and name, the author name and the file name", () => {
    const [fileItem, commentItem] = feed({
      comments: [comment("b", "2026-01-02T00:00:00Z")],
      files: [file("c", "2026-01-03T00:00:00Z", "u2")],
    });

    expect(fileItem).toMatchObject({
      kind: "file",
      projectId: "p1",
      projectName: "Website",
      authorName: "Mason Member",
      fileName: "c.pdf",
    });
    expect(commentItem).toMatchObject({
      kind: "comment",
      projectId: "p2",
      projectName: "Brand",
      authorName: "Mason Member",
    });
    expect(commentItem).not.toHaveProperty("fileName");
  });

  it("names a null author and an author missing from the member map 'Former member'", () => {
    const items = feed({
      updates: [
        update("a", "2026-01-01T00:00:00Z", null),
        update("b", "2026-01-02T00:00:00Z", "ghost"),
      ],
      files: [file("c", "2026-01-03T00:00:00Z", null)],
    });

    expect(items.map((item) => item.authorName)).toEqual([
      "Former member",
      "Former member",
      "Former member",
    ]);
  });

  it("never reads 'Unknown' for an author", () => {
    const items = feed({
      updates: [update("a", "2026-01-01T00:00:00Z", "ghost")],
    });

    expect(items[0]?.authorName).not.toMatch(/unknown/i);
  });

  it("falls back to 'Unknown project' when the project embed is missing", () => {
    const [item] = feed({
      updates: [
        {
          id: "a",
          project_id: "gone",
          author_id: "u1",
          created_at: "2026-01-01T00:00:00Z",
          projects: null,
        },
      ],
    });

    expect(item).toMatchObject({
      projectId: "gone",
      projectName: "Unknown project",
    });
  });

  it("breaks ties within a kind by row id so the order never depends on input order", () => {
    const at = "2026-01-01T00:00:00Z";
    const forward = feed({ updates: [update("a", at), update("b", at)] });
    const backward = feed({ updates: [update("b", at), update("a", at)] });

    expect(forward.map((item) => item.id)).toEqual(["update-a", "update-b"]);
    expect(backward.map((item) => item.id)).toEqual(["update-a", "update-b"]);
  });

  it("sorts an item with an invalid timestamp last without disturbing the rest", () => {
    const items = feed({
      updates: [
        update("bad", "not a date"),
        update("old", "2026-01-01T00:00:00Z"),
        update("new", "2026-01-03T00:00:00Z"),
      ],
      comments: [comment("mid", "2026-01-02T00:00:00Z")],
    });

    expect(items.map((item) => item.id)).toEqual([
      "update-new",
      "comment-mid",
      "update-old",
      "update-bad",
    ]);
  });
});
