import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";

test.describe("member row reports server-rejected changes", () => {
  test("changing the role of a member removed by another owner shows an error and reverts the select", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const owner1Email = `owner1-${suffix}@e2e.clientdesk.test`;
    const owner2Email = `owner2-${suffix}@e2e.clientdesk.test`;

    // Owner 1 signs up and creates the workspace.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner One");
    await page.getByLabel("Email").fill(owner1Email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Owner Race Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-owner-race-agency-[a-z0-9]+$/);

    // Owner 1 invites Owner 2, also as an owner.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(owner2Email);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Owner", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    // Without an email provider the dialog shows the invite link; close it.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: owner2Email })).toBeVisible();

    const inviteUrl = await readLastInviteUrlFor(owner2Email);

    // Owner 2 accepts the invitation in a separate browser context so it
    // doesn't inherit Owner 1's session cookies.
    const owner2Context = await browser.newContext();
    const owner2Page = await owner2Context.newPage();
    const invitePath = new URL(inviteUrl).pathname;
    await owner2Page.goto(`/signup?next=${invitePath}`);
    await owner2Page.getByLabel("Full name").fill("E2E Owner Two");
    await owner2Page.getByLabel("Email").fill(owner2Email);
    await owner2Page.getByLabel("Password").fill("correct-horse-1");
    await owner2Page.getByRole("button", { name: "Sign up" }).click();
    await expect(owner2Page).toHaveURL(/\/invite\//);
    await owner2Page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(owner2Page).toHaveURL(/\/w\/e2e-owner-race-agency-[a-z0-9]+$/);

    // Owner 1's Members page still shows the old membership list (loaded
    // before Owner 2 removes themselves below), which is exactly the stale
    // state that produces the race: the role select for Owner 2's row is
    // visible and enabled here.
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Role for E2E Owner Two" }),
    ).toBeVisible();

    // Owner 2 removes themselves from a second, independent page, so the
    // `workspace_members` row Owner 1's page still has open disappears
    // server-side without Owner 1's page knowing.
    await owner2Page.getByRole("link", { name: "Members" }).click();
    await owner2Page
      .getByRole("row", { name: /E2E Owner Two/ })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(
      owner2Page.getByRole("cell", { name: "E2E Owner Two", exact: true }),
    ).toHaveCount(0);

    // Owner 1, still on the stale page, tries to demote the now-removed
    // Owner 2: the update matches zero rows server-side, which must surface
    // as an error and leave the select showing the last confirmed role
    // rather than silently accepting the picked value.
    await page
      .getByRole("combobox", { name: "Role for E2E Owner Two" })
      .click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    // `getByRole("alert")` also matches Next.js's own route-announcer div
    // (permanently in the DOM, permanently empty), so this scopes to the
    // member row to reach the error text this component renders.
    await expect(
      page.getByRole("row", { name: /E2E Owner Two/ }).getByRole("alert"),
    ).toContainText("Could not change this member's role");
    await expect(
      page.getByRole("combobox", { name: "Role for E2E Owner Two" }),
    ).toContainText("Owner");

    await owner2Context.close();
  });

  test("removing a member already removed by another owner shows an error next to Remove", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const owner1Email = `owner1-${suffix}@e2e.clientdesk.test`;
    const owner2Email = `owner2-${suffix}@e2e.clientdesk.test`;

    // Owner 1 signs up and creates the workspace.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner One");
    await page.getByLabel("Email").fill(owner1Email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Owner Remove Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-owner-remove-agency-[a-z0-9]+$/);

    // Owner 1 invites Owner 2, also as an owner.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(owner2Email);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Owner", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    // Without an email provider the dialog shows the invite link; close it.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: owner2Email })).toBeVisible();

    const inviteUrl = await readLastInviteUrlFor(owner2Email);

    // Owner 2 accepts the invitation in a separate browser context so it
    // doesn't inherit Owner 1's session cookies.
    const owner2Context = await browser.newContext();
    const owner2Page = await owner2Context.newPage();
    const invitePath = new URL(inviteUrl).pathname;
    await owner2Page.goto(`/signup?next=${invitePath}`);
    await owner2Page.getByLabel("Full name").fill("E2E Owner Two");
    await owner2Page.getByLabel("Email").fill(owner2Email);
    await owner2Page.getByLabel("Password").fill("correct-horse-1");
    await owner2Page.getByRole("button", { name: "Sign up" }).click();
    await expect(owner2Page).toHaveURL(/\/invite\//);
    await owner2Page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(owner2Page).toHaveURL(
      /\/w\/e2e-owner-remove-agency-[a-z0-9]+$/,
    );

    // Owner 1's Members page still shows the old membership list (loaded
    // before Owner 2 removes themselves below), which is exactly the stale
    // state that produces the race: the Remove button for Owner 2's row is
    // visible and enabled here.
    await page.reload();
    await expect(
      page
        .getByRole("row", { name: /E2E Owner Two/ })
        .getByRole("button", { name: "Remove" }),
    ).toBeVisible();

    // Owner 2 removes themselves from a second, independent page, so the
    // `workspace_members` row Owner 1's page still has open disappears
    // server-side without Owner 1's page knowing.
    await owner2Page.getByRole("link", { name: "Members" }).click();
    await owner2Page
      .getByRole("row", { name: /E2E Owner Two/ })
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(
      owner2Page.getByRole("cell", { name: "E2E Owner Two", exact: true }),
    ).toHaveCount(0);

    // Owner 1, still on the stale page, tries to remove the now-already-gone
    // Owner 2: the delete matches zero rows server-side, which must surface
    // as an error next to the Remove button (not the role select's error,
    // which shares nothing with it once each control has its own slot).
    await page
      .getByRole("row", { name: /E2E Owner Two/ })
      .getByRole("button", { name: "Remove" })
      .click();
    const removeRow = page.getByRole("row", { name: /E2E Owner Two/ });
    await expect(removeRow.getByRole("alert")).toContainText(
      "Could not remove this member",
    );
    // The row itself stays in the list - the failed removal didn't happen.
    await expect(
      page.getByRole("cell", { name: "E2E Owner Two", exact: true }),
    ).toBeVisible();

    await owner2Context.close();
  });
});
