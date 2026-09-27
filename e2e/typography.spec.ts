import { test, expect } from "@playwright/test";

test.describe("typography", () => {
  test("body resolves the Geist font instead of falling back to a browser default serif", async ({
    page,
  }) => {
    await page.goto("/login");

    const bodyFontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );

    expect(bodyFontFamily).toMatch(/Geist/);
  });
});
