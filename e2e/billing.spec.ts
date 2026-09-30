import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";

test.describe("billing", () => {
  test("Free limit, unconfigured billing page, and per-role visibility", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `billing-owner-${suffix}@e2e.clientdesk.test`;
    const memberEmail = `billing-member-${suffix}@e2e.clientdesk.test`;
    const clientEmail = `billing-client-${suffix}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Billing Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Billing Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-billing-agency-[a-z0-9]+$/);
    const workspaceUrl = page.url();

    // The Free plan allows two clients; the owner adds exactly that many.
    await page.getByRole("link", { name: "Clients" }).click();
    for (const name of ["Client One Co.", "Client Two Co."]) {
      await page.getByRole("button", { name: "New client" }).click();
      await page.getByLabel("Client name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name })).toBeVisible();
    }
    await expect(page.getByText("2 / 2 clients used.")).toBeVisible();

    // A third is refused with the upgrade prompt, not a generic error.
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill("Client Three Co.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page
        .getByRole("alert")
        .getByText(
          "The Free plan allows 2 clients. Upgrade to Pro to add more.",
        ),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Client Three Co." }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The clients page itself offers the same upgrade link at the limit.
    await expect(
      page.getByRole("link", { name: "Upgrade to Pro" }),
    ).toBeVisible();

    // The owner's billing page: Free, 2/2, and — since CI runs with no
    // Stripe keys — the buttons disabled with a "not configured" note.
    await page.getByRole("link", { name: "Billing" }).click();
    await expect(page.getByText("Free")).toBeVisible();
    await expect(page.getByText("2 / 2 clients used")).toBeVisible();
    await expect(page.getByText("Billing is not configured.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upgrade to Pro" }),
    ).toBeDisabled();

    // Invite a member: they see the same billing page, read-only.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    // Without an email provider the dialog shows the invite link; close it.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: memberEmail })).toBeVisible();
    const memberInviteUrl = await readLastInviteUrlFor(memberEmail);

    // Invite a client user for Client One Co.: they get a 404 on billing.
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Client", exact: true }).click();
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: "Client One Co." }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    // Without an email provider the dialog shows the invite link; close it.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("cell", { name: clientEmail })).toBeVisible();
    const clientInviteUrl = await readLastInviteUrlFor(clientEmail);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    const memberInvitePath = new URL(memberInviteUrl).pathname;
    await memberPage.goto(`/signup?next=${memberInvitePath}`);
    await memberPage.getByLabel("Full name").fill("E2E Billing Member");
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByLabel("Password").fill("correct-horse-1");
    await memberPage.getByRole("button", { name: "Sign up" }).click();
    await expect(memberPage).toHaveURL(/\/invite\//);
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(memberPage).toHaveURL(workspaceUrl);

    await memberPage.getByRole("link", { name: "Billing" }).click();
    await expect(memberPage.getByText("Free")).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: "Upgrade to Pro" }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Resync" }),
    ).toHaveCount(0);
    await memberContext.close();

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    const clientInvitePath = new URL(clientInviteUrl).pathname;
    await clientPage.goto(`/signup?next=${clientInvitePath}`);
    await clientPage.getByLabel("Full name").fill("E2E Billing Client");
    await clientPage.getByLabel("Email").fill(clientEmail);
    await clientPage.getByLabel("Password").fill("correct-horse-1");
    await clientPage.getByRole("button", { name: "Sign up" }).click();
    await expect(clientPage).toHaveURL(/\/invite\//);
    await clientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(clientPage).toHaveURL(workspaceUrl);

    await clientPage.goto(`${workspaceUrl}/settings/billing`);
    await expect(clientPage.getByText("Page not found")).toBeVisible();
    await clientContext.close();
  });
});
