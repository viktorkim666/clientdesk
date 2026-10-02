import { test, expect, type Locator, type Page } from "@playwright/test";
import { startSharedDemo } from "./support/demo";
import { backgroundStack, contrastRatio } from "./support/contrast";
import {
  createClientViaDialog,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

const MIN_CONTRAST = 4.5;

// Contrast of the button text against its own translucent tint composited
// over everything painted behind it (including the row's hover background).
async function textContrast(page: Page, button: Locator): Promise<number> {
  const [layers, text] = await Promise.all([
    backgroundStack(button),
    button.evaluate((element) => getComputedStyle(element).color),
  ]);
  return contrastRatio(page, text, layers);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`destructive button in ${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const base = await startSharedDemo(page, "agency");
      await page.goto(`${base}/settings/members`);
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      // Measure the settled colors, not a frame of the hover transition.
      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; }",
      });
    });

    test("its text keeps 4.5:1 at rest and on hover", async ({ page }) => {
      const remove = page.getByRole("button", { name: "Remove Priya Nair" });
      await expect(remove).toBeVisible();

      const rest = await textContrast(page, remove);
      expect(rest, "at rest").toBeGreaterThanOrEqual(MIN_CONTRAST);

      await remove.hover();
      const hover = await textContrast(page, remove);
      expect(hover, "on hover").toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    // Opening the dialog and typing the name change nothing in the sandbox.
    test("the project delete button in its dialog keeps 4.5:1 at rest and on hover", async ({
      page,
    }) => {
      const base = new URL(page.url()).pathname.replace(
        /\/settings\/members$/,
        "",
      );
      await page.goto(`${base}/projects`);
      await page
        .getByRole("link", { name: "Website redesign", exact: true })
        .click();
      await page.getByRole("button", { name: "Delete project" }).click();
      const dialog = page.getByRole("alertdialog");
      await dialog
        .getByLabel("Type the project name to confirm")
        .fill("Website redesign");
      const confirm = dialog.getByRole("button", { name: "Delete project" });
      await expect(confirm).toBeEnabled();
      // The dialog fades in; measure the settled colors.
      await expect(
        page.locator("[data-starting-style], [data-ending-style]"),
      ).toHaveCount(0);

      const rest = await textContrast(page, confirm);
      expect(rest, "at rest").toBeGreaterThanOrEqual(MIN_CONTRAST);

      await confirm.hover();
      const hover = await textContrast(page, confirm);
      expect(hover, "on hover").toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });
}

// A client with nothing in it, in a fresh workspace, so the confirmation and
// the row menu can be opened without touching the shared demo.
for (const scheme of ["light", "dark"] as const) {
  test.describe(`client delete controls in ${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
        page,
        `contrast-client-${scheme}`,
        test.info().workerIndex,
      );
      await createClientViaDialog(page, workspaceUrl, "Contrast Co.");
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      await page.addStyleTag({
        content: "*, *::before, *::after { transition: none !important; }",
      });
    });

    test("the Delete client button keeps 4.5:1 at rest and on hover", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Actions for Contrast Co." })
        .click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const confirm = page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete client" });
      await expect(confirm).toBeEnabled();
      await expect(
        page.locator("[data-starting-style], [data-ending-style]"),
      ).toHaveCount(0);

      const rest = await textContrast(page, confirm);
      expect(rest, "at rest").toBeGreaterThanOrEqual(MIN_CONTRAST);

      await confirm.hover();
      const hover = await textContrast(page, confirm);
      expect(hover, "on hover").toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    test("the destructive Delete menu item keeps 4.5:1 at rest and when focused", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Actions for Contrast Co." })
        .click();
      const item = page.getByRole("menuitem", { name: "Delete" });
      await expect(item).toBeVisible();
      await expect(
        page.locator("[data-starting-style], [data-ending-style]"),
      ).toHaveCount(0);

      // No item is focused yet, so Delete is at rest.
      const rest = await textContrast(page, item);
      expect(rest, "at rest").toBeGreaterThanOrEqual(MIN_CONTRAST);

      // The first arrow lands on Rename, the second on Delete.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(item).toBeFocused();
      const focused = await textContrast(page, item);
      expect(focused, "focused").toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });
}
