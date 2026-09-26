import { test, expect } from "@playwright/test";

test.describe("auth", () => {
  test("a new user can sign up and lands on onboarding", async ({ page }) => {
    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText("Create your workspace")).toBeVisible();
  });

  test("signing out and logging back in returns to the same workspace", async ({
    page,
  }) => {
    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Auth Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-auth-agency-[a-z0-9]+$/);
    const workspaceUrl = page.url();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(workspaceUrl);
  });
});
