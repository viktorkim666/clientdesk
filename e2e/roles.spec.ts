import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";

test.describe("end-to-end role check", () => {
  test("an invited client sees only their own client's project", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `owner-${suffix}@e2e.clientdesk.test`;
    const clientEmail = `client-${suffix}@e2e.clientdesk.test`;

    // Owner signs up, creates a workspace, two clients and a project each.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Roles Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-roles-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    for (const name of ["Client A Co.", "Client B Co."]) {
      await page.getByRole("button", { name: "New client" }).click();
      await page.getByLabel("Client name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Projects" }).click();
    for (const [projectName, clientName] of [
      ["Client A Project", "Client A Co."],
      ["Client B Project", "Client B Co."],
    ] as const) {
      await page.getByRole("button", { name: "New project" }).click();
      await page.getByLabel("Project name").fill(projectName);
      await page.getByLabel("Client").click();
      await page.getByRole("option", { name: clientName }).click();
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name: projectName })).toBeVisible();
    }

    // Owner invites a client user for Client A.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Client", exact: true }).click();
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: "Client A Co." }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    // Without an email provider the dialog shows the invite link; close it.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: clientEmail })).toBeVisible();

    const inviteUrl = await readLastInviteUrlFor(clientEmail);

    // The invitee signs up from the link and accepts, in a separate browser
    // context so it doesn't inherit the owner's signed-in session cookies.
    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await clientPage.goto(inviteUrl);
    await expect(
      clientPage.getByText("Sign in or create an account"),
    ).toBeVisible();

    // Navigate directly instead of clicking the "Sign up" link: the sign-up
    // form itself is already covered by e2e/auth.spec.ts, and this keeps the
    // slower composite flow from being flaky on an unrelated UI detail.
    const invitePath = new URL(inviteUrl).pathname;
    await clientPage.goto(`/signup?next=${invitePath}`);
    await clientPage.getByLabel("Full name").fill("E2E Client A User");
    await clientPage.getByLabel("Email").fill(clientEmail);
    await clientPage.getByLabel("Password").fill("correct-horse-1");
    await clientPage.getByRole("button", { name: "Sign up" }).click();

    await expect(clientPage).toHaveURL(/\/invite\//);
    await clientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(clientPage).toHaveURL(/\/w\/e2e-roles-agency-[a-z0-9]+$/);

    // The client sees only their own client's project.
    await clientPage.getByRole("link", { name: "Projects" }).click();
    await expect(
      clientPage.getByRole("cell", { name: "Client A Project" }),
    ).toBeVisible();
    await expect(
      clientPage.getByRole("cell", { name: "Client B Project" }),
    ).toHaveCount(0);

    await clientContext.close();
  });
});
