import { test, expect, type Locator, type Page } from "@playwright/test";
import { login } from "./support/auth";
import { backgroundStack, contrastRatio } from "./support/contrast";

const OWNER_EMAIL = "maya@northwind.test";
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
      await login(page, OWNER_EMAIL);
      await page.goto("/w/northwind/settings/members");
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
  });
}
