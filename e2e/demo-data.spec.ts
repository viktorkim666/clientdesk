import { test, expect, type Page } from "@playwright/test";
import { login } from "./support/auth";

// The Northwind Studio demo workspace from supabase/seed.sql (UUID prefix 3).
// It mirrors the landing preview, so the landing, the social image and the
// real demo tell one story. e2e/visual-polish.spec.ts reads it too.
const OWNER_EMAIL = "maya@northwind.test";
const CLIENT_EMAIL = "priya@acmebakery.test";
const FIXTURE_OWNER_EMAIL = "owner@clientdesk.test";

// Counts from the Northwind block in supabase/seed.sql: 10 projects (8
// active), 5 clients. Change them together with the seed.
const SEEDED_PROJECTS = 10;
const SEEDED_ACTIVE_PROJECTS = 8;
const SEEDED_CLIENTS = 5;
// A table's header row is one more row than the data it lists.
const HEADER_ROWS = 1;

function metricCard(page: Page, title: RegExp) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
  });
}

test.describe("demo workspace", () => {
  test("the demo owner lands on a filled Northwind Studio dashboard", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);
    await expect(page).toHaveURL(/\/w\/northwind$/);

    await expect(
      page.getByRole("button", { name: "Northwind Studio", exact: true }),
    ).toBeVisible();

    await expect(metricCard(page, /^Active projects$/)).toHaveText(
      new RegExp(
        `Active projects\\s*${SEEDED_ACTIVE_PROJECTS}\\s*of ${SEEDED_PROJECTS}`,
      ),
    );
    await expect(metricCard(page, /^Clients$/)).toHaveText(
      new RegExp(`Clients\\s*${SEEDED_CLIENTS}$`),
    );

    await page.goto("/w/northwind/projects");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(
      SEEDED_PROJECTS + HEADER_ROWS,
    );
    await expect(
      page.getByRole("link", { name: "Website redesign", exact: true }),
    ).toBeVisible();

    await page.goto("/w/northwind/clients");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(
      SEEDED_CLIENTS + HEADER_ROWS,
    );
    for (const name of [
      "Acme Bakery",
      "Lumen Dental",
      "Harbor Yoga",
      "Fernhill Books",
    ]) {
      await expect(page.getByRole("cell", { name })).toBeVisible();
    }
  });

  test("a demo client sees only their own projects", async ({ page }) => {
    await login(page, CLIENT_EMAIL);
    await expect(page).toHaveURL(/\/w\/northwind$/);

    await page.goto("/w/northwind/projects");
    const rows = page.getByRole("table").getByRole("row");
    // Header row plus at least two Acme Bakery projects; the retrying wait
    // also lets the table finish rendering before the rows are read.
    await expect(rows.nth(2)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Website redesign", exact: true }),
    ).toBeVisible();

    const body = page.locator("body");
    await expect(body).not.toContainText("Lumen Dental");
    await expect(body).not.toContainText("Brand refresh");
    for (const row of (await rows.all()).slice(1)) {
      await expect(row).toContainText("Acme Bakery");
    }
  });

  test("the fixture owner does not see the demo workspace", async ({
    page,
  }) => {
    await login(page, FIXTURE_OWNER_EMAIL);

    await page
      .getByRole("button", { name: "Acme Agency", exact: true })
      .click();
    await expect(page.getByRole("menuitem")).not.toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Northwind Studio" }),
    ).toHaveCount(0);

    await page.goto("/w/northwind");
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
  });
});
