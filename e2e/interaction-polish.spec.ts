import { test, expect, type Locator, type Page } from "@playwright/test";
import { login } from "./support/auth";

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";

async function loginAsProOwner(page: Page) {
  await login(page, PRO_OWNER_EMAIL);
}

async function expectPointerCursor(locator: Locator) {
  const cursor = await locator.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(cursor).toBe("pointer");
}

async function expectMinimumTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label}: no bounding box`).not.toBeNull();
  if (box) {
    expect(
      box.height,
      `${label}: height ${box.height} < 44`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      box.width,
      `${label}: width ${box.width} < 44`,
    ).toBeGreaterThanOrEqual(44);
  }
}

test.describe("interaction polish", () => {
  test.describe("pointer cursor", () => {
    test("enabled controls on /login show a pointer cursor", async ({
      page,
    }) => {
      await page.goto("/login");

      await expectPointerCursor(page.getByRole("button", { name: "Sign in" }));
      await expectPointerCursor(page.getByRole("button", { name: "Theme" }));
    });

    test("enabled controls in the workspace show a pointer cursor", async ({
      page,
    }) => {
      await loginAsProOwner(page);

      await expectPointerCursor(page.getByRole("link", { name: "Dashboard" }));
      await expectPointerCursor(page.getByRole("button", { name: "Account" }));
    });

    test("a disabled button does not show a pointer cursor", async ({
      page,
    }) => {
      const email = `polish-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;
      await page.goto("/signup");
      await page.getByLabel("Full name").fill("Interaction Polish Owner");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("correct-horse-1");
      await page.getByRole("button", { name: "Sign up" }).click();

      await expect(page).toHaveURL(/\/onboarding$/);
      await page.getByLabel("Workspace name").fill("Polish Workspace");
      await page.getByRole("button", { name: "Create workspace" }).click();
      await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/);

      await page.getByRole("link", { name: "Projects" }).click();
      await expect(page).toHaveURL(/\/projects$/);

      const newProject = page.getByRole("button", { name: "New project" });
      await expect(newProject).toBeDisabled();
      const cursor = await newProject.evaluate(
        (element) => getComputedStyle(element).cursor,
      );
      expect(cursor).not.toBe("pointer");
    });
  });

  test.describe("touch targets at 375px", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("Theme button on /login is at least 44x44", async ({ page }) => {
      await page.goto("/login");
      await expectMinimumTouchTarget(
        page.getByRole("button", { name: "Theme" }),
        "login Theme button",
      );
    });

    test("Open navigation, Account and nav links in the sheet are at least 44x44", async ({
      page,
    }) => {
      // The Account menu's entrance animation briefly scales its popup
      // below 100%; reduced motion skips that transform so the Sign out
      // item's bounding box reflects its settled size instead of a
      // mid-animation frame.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await loginAsProOwner(page);

      const openNav = page.getByRole("button", { name: "Open navigation" });
      await expectMinimumTouchTarget(openNav, "Open navigation button");

      await openNav.click();

      const accountTrigger = page.getByRole("button", { name: "Account" });
      await expectMinimumTouchTarget(accountTrigger, "sheet Account button");

      for (const linkName of ["Dashboard", "Clients", "Projects"]) {
        await expectMinimumTouchTarget(
          page.getByRole("link", { name: linkName }),
          `sheet ${linkName} link`,
        );
      }

      // The Account menu's Sign out item is a compact menu row on desktop,
      // but inside the mobile sheet it must still clear the 44px touch
      // target minimum.
      await accountTrigger.click();
      await expectMinimumTouchTarget(
        page.getByRole("menuitem", { name: "Sign out" }),
        "sheet Sign out menu item",
      );
    });
  });

  test.describe("reduced motion", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the mobile sheet does not animate under reduced motion and still closes", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await loginAsProOwner(page);

      await page.getByRole("button", { name: "Open navigation" }).click();
      // The mobile sidebar sheet sets data-slot="sidebar" (Sidebar spreads
      // its own data-slot prop over SheetContent's default), so the popup
      // is found through the sidebar-specific attributes instead.
      const sheetContent = page.locator(
        '[data-sidebar="sidebar"][data-mobile="true"]',
      );
      await expect(sheetContent).toBeVisible();

      const durations = await sheetContent.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
      for (const value of [
        durations.animationDuration,
        durations.transitionDuration,
      ]) {
        const seconds = value.split(",").map((part) => parseFloat(part.trim()));
        for (const second of seconds) {
          expect(second).toBeLessThanOrEqual(0.01);
        }
      }

      await page.getByRole("link", { name: "Projects" }).click();
      await expect(page).toHaveURL(/\/projects$/);
      await expect(sheetContent).not.toBeVisible();
    });

    // Companion to the assertion above: without emulating reduced motion,
    // the sheet's transition duration is not just "small" but actually
    // greater than zero, so the reduced-motion test is proving the CSS
    // reacts to prefers-reduced-motion rather than the sheet never having
    // had a transition to begin with.
    test("the mobile sheet does animate when reduced motion is not requested", async ({
      page,
    }) => {
      await loginAsProOwner(page);

      await page.getByRole("button", { name: "Open navigation" }).click();
      const sheetContent = page.locator(
        '[data-sidebar="sidebar"][data-mobile="true"]',
      );
      await expect(sheetContent).toBeVisible();

      const durations = await sheetContent.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });

      const hasNonZeroDuration = [
        durations.animationDuration,
        durations.transitionDuration,
      ].some((value) =>
        value
          .split(",")
          .map((part) => parseFloat(part.trim()))
          .some((seconds) => seconds > 0.01),
      );
      expect(hasNonZeroDuration).toBe(true);
    });

    test("the New client dialog does not animate under reduced motion and still closes", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await loginAsProOwner(page);

      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("link", { name: "Clients" }).click();
      await page.getByRole("button", { name: "New client" }).click();

      const dialogContent = page.locator('[data-slot="dialog-content"]');
      await expect(dialogContent).toBeVisible();

      const durations = await dialogContent.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
      for (const value of [
        durations.animationDuration,
        durations.transitionDuration,
      ]) {
        const seconds = value.split(",").map((part) => parseFloat(part.trim()));
        for (const second of seconds) {
          expect(second).toBeLessThanOrEqual(0.01);
        }
      }

      await page.keyboard.press("Escape");
      await expect(dialogContent).not.toBeVisible();
    });
  });
});
