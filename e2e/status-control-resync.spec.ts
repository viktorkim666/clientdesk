import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";

test.describe("a project's stale status resyncs after an in-place revalidation", () => {
  test("a status changed by a second owner shows up once this page's own action revalidates it", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const owner1Email = `owner1-${suffix}@e2e.clientdesk.test`;
    const owner2Email = `owner2-${suffix}@e2e.clientdesk.test`;

    // Owner 1 signs up, creates the workspace, a client and a project.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner One");
    await page.getByLabel("Email").fill(owner1Email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Status Resync Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-status-resync-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill("Resync Client Co.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Resync Client Co." }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Resync Project");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Resync Project" }),
    ).toBeVisible();

    // Owner 1 invites Owner 2 as staff (owner), so they can also change the
    // project's status.
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
    const owner2Context = await browser.newContext();
    const owner2Page = await owner2Context.newPage();
    await owner2Page.goto(`/signup?next=${new URL(inviteUrl).pathname}`);
    await owner2Page.getByLabel("Full name").fill("E2E Owner Two");
    await owner2Page.getByLabel("Email").fill(owner2Email);
    await owner2Page.getByLabel("Password").fill("correct-horse-1");
    await owner2Page.getByRole("button", { name: "Sign up" }).click();
    await expect(owner2Page).toHaveURL(/\/invite\//);
    await owner2Page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(owner2Page).toHaveURL(
      /\/w\/e2e-status-resync-agency-[a-z0-9]+$/,
    );

    // Owner 1 opens the project page and captures its stale render: status
    // "active", loaded before Owner 2 changes it below.
    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("link", { name: "Resync Project" }).click();
    await expect(
      page.getByRole("combobox", { name: "Project status" }),
    ).toContainText("Active");
    const projectUrl = page.url();

    // Owner 2 opens the same project from their own page and changes its
    // status. `revalidatePath` in `changeStatus` invalidates the project
    // route's cache server-side; nothing pushes that update to Owner 1's
    // already-open tab on its own.
    await owner2Page.goto(projectUrl);
    await owner2Page.getByRole("combobox", { name: "Project status" }).click();
    await owner2Page.getByRole("option", { name: "On hold" }).click();
    await expect(
      owner2Page.getByRole("combobox", { name: "Project status" }),
    ).toContainText("On hold");

    // Owner 1, still on the same, now-stale project page (no navigation, no
    // reload), posts an update. `postUpdate` also calls `revalidatePath` on
    // this route, so Next.js refetches this page's Server Components in
    // place, reconciling into the already-mounted `StatusControl` - the
    // exact situation the resync fix targets, unlike a full reload or a
    // cross-route navigation (which would remount the component and mask
    // whether the resync itself works).
    await page
      .getByLabel("Post an update for the client")
      .fill("Status check-in");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Status check-in")).toBeVisible();

    await expect(
      page.getByRole("combobox", { name: "Project status" }),
    ).toContainText("On hold");

    await owner2Context.close();
  });
});
