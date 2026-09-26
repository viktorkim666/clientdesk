import { describe, expect, it } from "vitest";
import { projectSchema } from "@/lib/validation/project";

const validProject = {
  name: "Website Redesign",
  clientId: "bab4cc25-726d-4fe0-a153-91d24fe07f10",
  status: "active" as const,
};

describe("projectSchema", () => {
  it("accepts a valid project", () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(projectSchema.safeParse({ ...validProject, name: "" }).success).toBe(
      false,
    );
  });

  it("rejects a client id that is not a uuid", () => {
    expect(
      projectSchema.safeParse({ ...validProject, clientId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("rejects a status outside the enum", () => {
    expect(
      projectSchema.safeParse({ ...validProject, status: "archived" }).success,
    ).toBe(false);
  });

  it.each(["active", "on_hold", "done"] as const)(
    "accepts status %s",
    (status) => {
      expect(projectSchema.safeParse({ ...validProject, status }).success).toBe(
        true,
      );
    },
  );
});
