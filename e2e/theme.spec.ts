import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";

test.describe("theme", () => {
  test("system default follows a dark emulated color scheme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("system default follows a light emulated color scheme", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");

    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("picking Light overrides a dark emulated scheme and survives a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("picking System follows the emulated scheme again", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");

    // A menuitemradio in Base UI keeps the menu open after a pick
    // (closeOnClick defaults to false for radio items), so System can be
    // picked right after Light without reopening the menu.
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("loading /login raises no console error mentioning a script tag", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/login");

    const scriptWarnings = consoleErrors.filter((text) =>
      text.toLowerCase().includes("script"),
    );
    expect(scriptWarnings).toEqual([]);
  });

  test("the Theme toggle is present on pages outside a workspace", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();

    await page.goto("/signup");
    await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();

    const email = `owner-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Theme Toggle Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  });

  test("the Theme radio group has an accessible name outside a workspace", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Theme" }).click();

    const group = page.getByRole("group", { name: "Theme" });
    await expect(group.getByRole("menuitemradio")).toHaveCount(3);
    await expect(
      group.getByRole("menuitemradio", { name: "Light" }),
    ).toBeVisible();
    await expect(
      group.getByRole("menuitemradio", { name: "Dark" }),
    ).toBeVisible();
    await expect(
      group.getByRole("menuitemradio", { name: "System" }),
    ).toBeVisible();
  });

  test("the Theme radio group has an accessible name in the Account menu", async ({
    page,
  }) => {
    await login(page, PRO_OWNER_EMAIL);
    await page.getByRole("button", { name: "Account" }).click();

    const group = page.getByRole("group", { name: "Theme" });
    await expect(group.getByRole("menuitemradio")).toHaveCount(3);
  });
});
