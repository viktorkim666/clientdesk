import { randomInt } from "node:crypto";
import { expect, test, type Cookie, type Page } from "@playwright/test";

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

// Sandboxes already started in this worker, by spec file and role: the path
// of the workspace and the cookies that sign a browser into it.
const sharedSandboxes = new Map<
  string,
  { workspacePath: string; cookies: Cookie[] }
>();

/**
 * Like `startDemo`, but the first call in a spec file starts the sandbox and
 * every later call in the same file signs the test's browser into that same
 * sandbox instead of starting another. Each sandbox counts toward the
 * 40-an-hour cap in create_demo_sandbox (see e2e/support/global-setup.ts), so
 * specs that only read a sandbox share one.
 *
 * Use it only where the test leaves the sandbox as it found it: a test that
 * posts, uploads, removes or uses up a limit needs `startDemo`. The cookies
 * are copied, so signing in as the other role (the banner switch) in one
 * test does not change what the next one starts with.
 */
export async function startSharedDemo(
  page: Page,
  role: "agency" | "client",
): Promise<string> {
  const key = `${test.info().file}:${role}`;
  const shared = sharedSandboxes.get(key);
  if (!shared) {
    const workspacePath = await startDemo(page, role);
    sharedSandboxes.set(key, {
      workspacePath,
      cookies: await page.context().cookies(),
    });
    return workspacePath;
  }

  await page.context().addCookies(shared.cookies);
  await page.goto(shared.workspacePath);
  await expect(page).toHaveURL(WORKSPACE_URL);
  return shared.workspacePath;
}
