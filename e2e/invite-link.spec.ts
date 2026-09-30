import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";
import { signUpOwnerWithEmptyWorkspace } from "./support/workspace";

// e2e runs with the console email sender, so no provider delivers the
// invitation and the dialog hands the link to the owner instead.
test.describe("invite link", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("shows a copyable invite link when no email provider sent it", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "invite-link-owner",
      test.info().workerIndex,
    );
    const inviteeEmail = `invite-link-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto(`${workspaceUrl}/settings/members`);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("No email was sent")).toBeVisible();

    // The link is absolute, built from NEXT_PUBLIC_SITE_URL, and is the same
    // one the console sender wrote for the invitee.
    const link = dialog.getByRole("textbox", { name: "Invite link" });
    await expect(link).toHaveValue(/^http:\/\/localhost:3100\/invite\/.+/);
    // The link view names itself and puts focus on the link to copy.
    await expect(
      dialog.getByRole("heading", { name: "Invitation ready" }),
    ).toBeVisible();
    await expect(link).toBeFocused();
    expect(await link.inputValue()).toBe(
      await readLastInviteUrlFor(inviteeEmail),
    );

    await dialog.getByRole("button", { name: "Copy invite link" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied");
    // The note clears on its own, so a second copy is announced again.
    await expect(dialog.getByRole("status")).toHaveText("", { timeout: 5000 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await link.inputValue(),
    );

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("cell", { name: inviteeEmail })).toBeVisible();

    // Opening the dialog again starts from the empty form, not the old link.
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Invite link" }),
    ).toHaveCount(0);
  });

  test("drops the old link the moment Done is clicked, not after the exit animation", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "invite-link-stale",
      test.info().workerIndex,
    );

    await page.goto(`${workspaceUrl}/settings/members`);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page
      .getByLabel("Email")
      .fill(`invite-stale-${Date.now()}@e2e.clientdesk.test`);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    // One-shot counts, not retrying assertions: they must hold right after the
    // click, while the dialog frame is still fading out.
    expect(
      await page.getByRole("textbox", { name: "Invite link" }).count(),
    ).toBe(0);
    expect(
      await page.getByRole("button", { name: "Copy invite link" }).count(),
    ).toBe(0);
  });

  test("keeps the copy button 44px tall on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "invite-link-phone",
      test.info().workerIndex,
    );

    await page.goto(`${workspaceUrl}/settings/members`);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page
      .getByLabel("Email")
      .fill(`invite-phone-${Date.now()}@e2e.clientdesk.test`);
    await page.getByRole("button", { name: "Send invitation" }).click();

    const box = await page
      .getByRole("button", { name: "Copy invite link" })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });
});
