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
    await expect(
      page.getByRole("heading", { name: "Create your workspace" }),
    ).toBeVisible();
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

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(workspaceUrl);
  });

  // Regression test for a race between Base UI's Menu.Item closing the popup
  // synchronously on click (closeOnClick defaults to true) and the browser's
  // native submit activation for a `<button type="submit" form="...">`
  // rendered as that item. Run with `--repeat-each=10` to surface it: if the
  // Sign out item is unmounted before the click's activation behavior fires,
  // the form never submits and the page stays on the workspace instead of
  // redirecting to /login.
  test("signing out via keyboard reaches /login", async ({ page }) => {
    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Keyboard Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Keyboard Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-keyboard-agency-[a-z0-9]+$/);

    await page.getByRole("button", { name: "Account" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();

    // Whether the initial highlight lands on the first item depends on
    // exactly how the menu was opened, so walk down until Sign out is
    // reached instead of hard-coding a press count.
    const signOutItem = page.getByRole("menuitem", { name: "Sign out" });
    for (let i = 0; i < 6; i += 1) {
      const isFocused = await signOutItem.evaluate(
        (el) => el === document.activeElement,
      );
      if (isFocused) {
        break;
      }
      await page.keyboard.press("ArrowDown");
    }
    await expect(signOutItem).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the Sign out item is disabled while sign-out is pending", async ({
    page,
  }) => {
    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Pending Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Pending Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-pending-agency-[a-z0-9]+$/);

    // Hold the server-action request so the pending state stays observable.
    let releaseRequest: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    let actionRequests = 0;
    await page.route(/\/w\/[^/]+$/, async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        actionRequests += 1;
        await released;
      }
      await route.continue();
    });

    try {
      await page.getByRole("button", { name: "Account" }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();

      const pendingItem = page.getByRole("menuitem", {
        name: "Signing out...",
      });
      await expect(pendingItem).toBeDisabled();

      // Re-activate through paths that bypass pointer-events: none.
      await page.keyboard.press("Enter");
      await page.keyboard.press("Space");
      await pendingItem.dispatchEvent("click");
    } finally {
      releaseRequest();
    }

    await expect(page).toHaveURL(/\/login$/);
    expect(actionRequests).toBe(1);
  });
});
