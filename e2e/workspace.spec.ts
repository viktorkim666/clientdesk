import { test, expect } from "@playwright/test";

test.describe("staff flow", () => {
  test("an owner creates a client and a project for that client", async ({
    page,
  }) => {
    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Workspace Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-workspace-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill("Acme Client Co.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Acme Client Co." }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Website Redesign");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(
      page.getByRole("cell", { name: "Website Redesign" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Acme Client Co." }),
    ).toBeVisible();
  });
});
