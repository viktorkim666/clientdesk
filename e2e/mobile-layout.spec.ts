import { test, expect, type Page } from "@playwright/test";
import { login } from "./support/auth";

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";
// The seeded Free workspace's client user, already a member of Client A Inc.
// with a project (Client A Website Redesign) - see supabase/seed.sql.
const SEEDED_CLIENT_EMAIL = "client-a@clientdesk.test";

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function expectNoHorizontalScroll(page: Page, label: string) {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `${label}: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
    ).toBeLessThanOrEqual(overflow.clientWidth);
  }

  async function expectDialogFitsViewport(page: Page, label: string) {
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    expect(box, `${label}: dialog has no bounding box`).not.toBeNull();
    if (box) {
      expect(
        box.x + box.width,
        `${label}: dialog right edge ${box.x + box.width} exceeds viewport width 375`,
      ).toBeLessThanOrEqual(375);
    }
  }

  async function loginAsProOwner(page: Page) {
    await login(page, PRO_OWNER_EMAIL);
  }

  // At 375px the sidebar collapses into a sheet, so a nav link is only
  // visible after opening it (see e2e/navigation.spec.ts).
  async function openNavAndClick(page: Page, linkName: string) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: linkName }).click();
  }

  async function loginAsSeededClient(page: Page) {
    await login(page, SEEDED_CLIENT_EMAIL);
  }

  test("public routes have no horizontal scroll at 375px", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "/");

    await page.goto("/login");
    await expectNoHorizontalScroll(page, "/login");

    await page.goto("/signup");
    await expectNoHorizontalScroll(page, "/signup");
  });

  test("owner routes and dialogs have no horizontal scroll at 375px", async ({
    page,
  }) => {
    await loginAsProOwner(page);
    await expectNoHorizontalScroll(page, "dashboard");
    const workspaceUrl = page.url();

    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const clientName = `Mobile Client ${suffix}`;
    const projectName = `Mobile Project ${suffix}`;

    await openNavAndClick(page, "Clients");
    await expectNoHorizontalScroll(page, "clients");

    await page.getByRole("button", { name: "New client" }).click();
    await expectDialogFitsViewport(page, "new client dialog");
    await page.getByLabel("Client name").fill(clientName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: clientName })).toBeVisible();

    await openNavAndClick(page, "Projects");
    await expectNoHorizontalScroll(page, "projects");

    await page.getByRole("button", { name: "New project" }).click();
    await expectDialogFitsViewport(page, "new project dialog");
    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: projectName }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "project page");

    await page.goto(`${workspaceUrl}/settings/members`);
    await expectNoHorizontalScroll(page, "settings/members");

    await page.getByRole("button", { name: "Invite" }).click();
    await expectDialogFitsViewport(page, "invite member dialog");
    await page.keyboard.press("Escape");

    await page.goto(`${workspaceUrl}/settings/billing`);
    await expectNoHorizontalScroll(page, "settings/billing");
  });

  test("client routes have no horizontal scroll at 375px", async ({ page }) => {
    await loginAsSeededClient(page);
    await expectNoHorizontalScroll(page, "client dashboard");

    await openNavAndClick(page, "Projects");
    await expectNoHorizontalScroll(page, "client projects");

    await page.getByRole("link", { name: "Client A Website Redesign" }).click();
    await expect(
      page.getByRole("heading", { name: "Client A Website Redesign" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "client project page");
  });
});
