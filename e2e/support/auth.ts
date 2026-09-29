import { expect, type Page } from "@playwright/test";

// Password for every seeded user in supabase/seed.sql.
const SEEDED_PASSWORD = "password123";

/**
 * Logs in a seeded user through the /login form and waits for the redirect
 * into their workspace. Shared by specs that sign in as different seeded
 * accounts (see supabase/seed.sql for the full list).
 */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/);
}
