import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./support/auth";

// axe-core is a transitive dependency of @axe-core/playwright rather than a
// direct one, so its result type is derived from AxeBuilder#analyze()
// instead of importing the "axe-core" package directly (pnpm's isolated
// node_modules wouldn't resolve it from here).
type AxeResults = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type Violation = AxeResults["violations"][number];

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";

// Landmark and heading rules that matter for this app's layout (nested
// <main>, a missing top-level heading, duplicate landmarks) but aren't part
// of the wcag2a/wcag2aa tag sets, so they need their own axe pass rather
// than the whole best-practice tag set.
const LANDMARK_AND_HEADING_RULES = [
  "landmark-one-main",
  "landmark-main-is-top-level",
  "landmark-no-duplicate-main",
  "page-has-heading-one",
  "landmark-unique",
];

/**
 * Runs axe on the current page and returns a compact, readable report for
 * any WCAG 2 A/AA violation, plus the landmark/heading rules above: rule id,
 * impact, and the CSS selector (plus, for checks like color-contrast, the
 * contrast figures axe already computed) for every offending node. A raw
 * axe-core result is too deep to read in a failure message, so this
 * flattens it to one line per node.
 */
async function checkAccessibility(page: Page, label: string) {
  const wcagResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const landmarkResults = await new AxeBuilder({ page })
    .withRules(LANDMARK_AND_HEADING_RULES)
    .analyze();

  const violations = [...wcagResults.violations, ...landmarkResults.violations];
  const summary = formatViolations(violations);
  expect(violations, `${label}:\n${summary}`).toEqual([]);
}

function formatViolations(violations: Violation[]): string {
  if (violations.length === 0) {
    return "no violations";
  }

  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => {
          const detail = node.any[0]?.message ?? node.failureSummary ?? "";
          return `    - ${node.target.join(" ")}${detail ? ` — ${detail}` : ""}`;
        })
        .join("\n");
      return `  ${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
    })
    .join("\n");
}

async function loginAsProOwner(page: Page) {
  await login(page, PRO_OWNER_EMAIL);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (${colorScheme})`, () => {
    test(`every main route has no WCAG 2 A/AA violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });

      await page.goto("/login");
      await checkAccessibility(page, `/login (${colorScheme})`);

      await page.goto("/signup");
      await checkAccessibility(page, `/signup (${colorScheme})`);

      await loginAsProOwner(page);
      await checkAccessibility(page, `dashboard (${colorScheme})`);
      const workspaceUrl = page.url();

      const suffix = `${colorScheme}-${Date.now()}-${test.info().workerIndex}`;
      const clientName = `A11y Client ${suffix}`;
      const projectName = `A11y Project ${suffix}`;

      await page.getByRole("link", { name: "Clients" }).click();
      await page.getByRole("button", { name: "New client" }).click();
      await page.getByLabel("Client name").fill(clientName);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name: clientName })).toBeVisible();
      await checkAccessibility(page, `clients (${colorScheme})`);

      await page.getByRole("link", { name: "Projects" }).click();
      await page.getByRole("button", { name: "New project" }).click();
      await page.getByLabel("Project name").fill(projectName);
      await page.getByLabel("Client").click();
      await page.getByRole("option", { name: clientName }).click();
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name: projectName })).toBeVisible();
      await checkAccessibility(page, `projects (${colorScheme})`);

      await page.getByRole("link", { name: projectName }).click();
      await expect(
        page.getByRole("heading", { name: projectName }),
      ).toBeVisible();
      await checkAccessibility(page, `project page (${colorScheme})`);

      await page.goto(`${workspaceUrl}/settings/members`);
      await checkAccessibility(page, `settings/members (${colorScheme})`);

      await page.goto(`${workspaceUrl}/settings/billing`);
      await checkAccessibility(page, `settings/billing (${colorScheme})`);
    });

    // A separate, freshly signed-up session (as e2e/theme.spec.ts does),
    // because /onboarding only renders its form for a user with no
    // workspace yet, and the flow test above is already signed in as the
    // seeded Pro owner.
    test(`/onboarding has no WCAG 2 A/AA violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });

      const email = `a11y-onboarding-${colorScheme}-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;
      await page.goto("/signup");
      await page.getByLabel("Full name").fill("A11y Onboarding Owner");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("correct-horse-1");
      await page.getByRole("button", { name: "Sign up" }).click();

      await expect(page).toHaveURL(/\/onboarding$/);
      await checkAccessibility(page, `/onboarding (${colorScheme})`);
    });
  });
}

// Popup states are easy to miss with a single "page load" axe pass, so check
// the two menus that own an interactive `role="group"` (the Theme radio
// group) while they're open.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (open popups, ${colorScheme})`, () => {
    test(`the Account menu has no WCAG 2 A/AA violations when open in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await loginAsProOwner(page);
      await page.getByRole("button", { name: "Account" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await checkAccessibility(page, `Account menu open (${colorScheme})`);
    });

    test(`the Theme menu has no WCAG 2 A/AA violations when open in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/login");
      await page.getByRole("button", { name: "Theme" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await checkAccessibility(page, `Theme menu open (${colorScheme})`);
    });
  });
}
