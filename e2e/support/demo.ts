import { randomInt } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// The demo limits each visitor to 3 sandboxes an hour, keyed by a salted hash
// of the first x-forwarded-for address. Every call here presents its own
// address from the documentation range 203.0.113.0/24 (RFC 5737), so a rerun
// never trips that limit and nothing outside the test suite is affected.
export function visitorHeaders() {
  return { "x-forwarded-for": `203.0.113.${randomInt(1, 255)}` };
}

export const WORKSPACE_URL = /\/w\/northwind-[a-z0-9]+$/;

/**
 * Enters a fresh Northwind Studio sandbox through the landing page's demo
 * buttons, as the agency owner (Maya Chen) or the client (Priya Nair), and
 * returns the sandbox workspace path (`/w/northwind-<suffix>`). Each call
 * gets its own visitor address and its own sandbox.
 */
export async function startDemo(
  page: Page,
  role: "agency" | "client",
): Promise<string> {
  await page.context().setExtraHTTPHeaders(visitorHeaders());
  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("button", { name: `Try as ${role}` })
    .first()
    .click();
  await expect(page).toHaveURL(WORKSPACE_URL);
  return new URL(page.url()).pathname;
}
