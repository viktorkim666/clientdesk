import { randomInt } from "node:crypto";
import { test, expect } from "@playwright/test";

// Same isolation as demo-sandbox.spec.ts: a documentation-range address per
// test, so the per-visitor sandbox limit never trips on reruns.
test.describe("invites in the demo workspace", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `203.0.113.${randomInt(1, 255)}`,
    });
  });

  test("the Invite button is disabled and says why, in both sandbox workspaces", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("button", { name: "Try as agency" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/w\/northwind-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Members", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    const invite = page.getByRole("button", { name: "Invite", exact: true });
    await expect(invite).toBeDisabled();
    await expect(
      page.getByText("Invites are turned off in the demo workspace."),
    ).toBeVisible();
    await expect(invite).toHaveAccessibleDescription(
      "Invites are turned off in the demo workspace.",
    );

    // The second, Free workspace of the sandbox is a demo workspace too.
    await page.getByRole("button", { name: "Northwind Studio" }).click();
    await page.getByRole("menuitem", { name: /Northwind Labs/ }).click();
    await expect(page).toHaveURL(/\/w\/northwind-labs-[a-z0-9]+$/);
    await page.getByRole("link", { name: "Members", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Invite", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Invites are turned off in the demo workspace."),
    ).toBeVisible();
  });
});
