import { test, expect, type Page } from "@playwright/test";
import { startDemo, startSharedDemo } from "./support/demo";

const banner = (page: Page) =>
  page.getByRole("region", { name: "Demo workspace" });

test.describe("demo sandbox", () => {
  test("Try as agency lands signed in as the owner", async ({ page }) => {
    await startSharedDemo(page, "agency");

    await expect(banner(page)).toContainText(
      "Viewing as Maya Chen (agency owner)",
    );
    await expect(banner(page)).toContainText("Resets within 24 hours");
    await expect(
      page.getByRole("button", { name: "Switch to client view" }),
    ).toBeVisible();
    // Only staff see the Clients page in the sidebar.
    await expect(
      page.getByRole("link", { name: "Clients", exact: true }),
    ).toBeVisible();
  });

  test("Try as client lands signed in as Priya, who sees only her projects", async ({
    page,
  }) => {
    await startSharedDemo(page, "client");

    await expect(banner(page)).toContainText(
      "Viewing as Priya Nair (client, Acme Bakery)",
    );
    await expect(
      page.getByRole("button", { name: "Switch to agency view" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(
      page
        .getByRole("table")
        .getByRole("link", { name: "Website redesign", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("table")
        .getByRole("link", { name: "Brand refresh", exact: true }),
    ).toHaveCount(0);
  });

  test("the banner switches between the agency and client views", async ({
    page,
  }) => {
    await startSharedDemo(page, "agency");
    const workspaceUrl = page.url();

    await page.getByRole("button", { name: "Switch to client view" }).click();
    await expect(banner(page)).toContainText(
      "Viewing as Priya Nair (client, Acme Bakery)",
    );
    await expect(page).toHaveURL(workspaceUrl);
    await expect(
      page.getByRole("link", { name: "Clients", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Switch to agency view" }).click();
    await expect(banner(page)).toContainText(
      "Viewing as Maya Chen (agency owner)",
    );
    await expect(page).toHaveURL(workspaceUrl);
    await expect(
      page.getByRole("link", { name: "Clients", exact: true }),
    ).toBeVisible();
  });

  test("two sandboxes do not see each other's comments", async ({
    page,
    browser,
  }) => {
    const comment = `Isolation check ${Date.now()}`;

    await startDemo(page, "agency");
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await page
      .getByRole("table")
      .getByRole("link", { name: "Website redesign", exact: true })
      .click();
    await page.getByLabel("Write a comment").first().fill(comment);
    await page
      .getByRole("button", { name: "Comment", exact: true })
      .first()
      .click();
    await expect(page.getByText(comment)).toBeVisible();

    // A second visitor, with their own address and no shared cookies.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await startDemo(otherPage, "agency");
    expect(otherPage.url()).not.toBe(page.url());
    await otherPage
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await otherPage
      .getByRole("table")
      .getByRole("link", { name: "Website redesign", exact: true })
      .click();
    // The project is loaded (its update forms are there) and the comment is not.
    await expect(otherPage.getByLabel("Write a comment").first()).toBeVisible();
    await expect(otherPage.getByText(comment)).toHaveCount(0);
    await other.close();
  });

  test("on a phone the banner is one compact row with a 44px switch button", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await startSharedDemo(page, "agency");

    // Only the short line is shown; the long wording is hidden on a phone.
    await expect(
      banner(page).getByText("Maya Chen, agency", { exact: true }),
    ).toBeVisible();
    await expect(
      banner(page).getByText("Viewing as Maya Chen (agency owner)"),
    ).toBeHidden();
    await expect(
      banner(page).getByText("Resets within 24 hours"),
    ).toBeVisible();
    const button = page.getByRole("button", { name: "Switch to client view" });
    await expect(button).toBeVisible();

    const bannerBox = await banner(page).boundingBox();
    const buttonBox = await button.boundingBox();
    expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    // It used to stack three lines and a full-width button (about 140px).
    expect(bannerBox?.height).toBeLessThan(72);
  });

  test("once the client is removed the banner stops offering the switch", async ({
    page,
  }) => {
    const base = await startDemo(page, "agency");
    await expect(
      page.getByRole("button", { name: "Switch to client view" }),
    ).toBeVisible();

    await page.goto(`${base}/settings/members`);
    await page.getByRole("button", { name: "Remove Priya Nair" }).click();
    await expect(
      page.getByRole("button", { name: "Remove Priya Nair" }),
    ).toHaveCount(0);

    await page.goto(base);
    await expect(banner(page)).toContainText(
      "Viewing as Maya Chen (agency owner)",
    );
    await expect(page.getByRole("button", { name: /^Switch to/ })).toHaveCount(
      0,
    );
  });
});
