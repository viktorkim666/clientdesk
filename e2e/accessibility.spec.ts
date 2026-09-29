import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./support/auth";
import { readLastInviteUrlFor } from "./support/emails";
import {
  buildFilledWorkspace,
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

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
  // Base UI marks popups that are mid-transition (opening or closing) with
  // these attributes. axe would measure their half-faded colors, so wait for
  // every transition to finish first.
  await expect(
    page.locator("[data-starting-style], [data-ending-style]"),
  ).toHaveCount(0);
  // The enter/exit fades are CSS animations that keep running after Base UI
  // drops its attributes, so also wait until no finite animation is in flight
  // (looping ones, like a spinner, never finish and are ignored).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().endTime !== Infinity,
            ).length,
      ),
    )
    .toBe(0);

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
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("cell", { name: clientName })).toBeVisible();
      await checkAccessibility(page, `clients (${colorScheme})`);

      await page.getByRole("link", { name: "Projects" }).click();
      await page.getByRole("button", { name: "New project" }).click();
      await page.getByLabel("Project name").fill(projectName);
      await page.getByLabel("Client").click();
      await page.getByRole("option", { name: clientName }).click();
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
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

    // The owner sends a real invitation, then a separate signed-out context
    // opens the emailed link: the view an invitee sees first.
    test(`/invite/[token] signed out has no WCAG 2 A/AA violations in ${colorScheme}`, async ({
      page,
      browser,
    }) => {
      await page.emulateMedia({ colorScheme });
      await loginAsProOwner(page);

      const inviteeEmail = `a11y-invitee-${colorScheme}-${Date.now()}-${test.info().workerIndex}@e2e.clientdesk.test`;
      await page.getByRole("link", { name: "Members" }).click();
      await page.getByRole("button", { name: "Invite" }).click();
      await page.getByLabel("Email").fill(inviteeEmail);
      await page.getByLabel("Role").click();
      await page.getByRole("option", { name: "Member", exact: true }).click();
      await page.getByRole("button", { name: "Send invitation" }).click();
      await expect(
        page.getByRole("cell", { name: inviteeEmail }),
      ).toBeVisible();

      const inviteUrl = await readLastInviteUrlFor(inviteeEmail);
      const context = await browser.newContext({ colorScheme });
      try {
        const inviteePage = await context.newPage();
        await inviteePage.goto(inviteUrl);
        await expect(
          inviteePage.getByText("Sign in or create an account"),
        ).toBeVisible();
        await checkAccessibility(
          inviteePage,
          `/invite/[token] signed out (${colorScheme})`,
        );
      } finally {
        await context.close();
      }
    });
  });
}

// Empty and populated screens render different components (empty states,
// the activity feed, badges, avatars), so each needs its own axe pass.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`accessibility (empty and filled workspace, ${colorScheme})`, () => {
    test(`the empty workspace screens have no WCAG 2 A/AA violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
        page,
        `a11y-empty-${colorScheme}`,
        test.info().workerIndex,
      );
      await expect(
        page.getByRole("main").getByText("No activity yet"),
      ).toBeVisible();
      await checkAccessibility(page, `empty dashboard (${colorScheme})`);

      await page.goto(`${workspaceUrl}/projects`);
      await expect(
        page.getByRole("main").getByText("Add a client first"),
      ).toBeVisible();
      await checkAccessibility(
        page,
        `empty projects without clients (${colorScheme})`,
      );

      await page.goto(`${workspaceUrl}/clients`);
      await expect(
        page.getByRole("main").getByText("Add your first client"),
      ).toBeVisible();
      await checkAccessibility(page, `empty clients (${colorScheme})`);

      await createClientViaDialog(page, workspaceUrl, "A11y Empty Client");
      await page.goto(`${workspaceUrl}/projects`);
      await expect(
        page.getByRole("main").getByText("Start your first project"),
      ).toBeVisible();
      await checkAccessibility(
        page,
        `empty projects with a client (${colorScheme})`,
      );

      await page.goto(`${workspaceUrl}/settings/members`);
      await expect(
        page.getByRole("main").getByText("No pending invitations"),
      ).toBeVisible();
      await checkAccessibility(page, `empty members (${colorScheme})`);

      await page.goto(`${workspaceUrl}/settings/billing`);
      await checkAccessibility(page, `billing (${colorScheme})`);

      await createProjectAndOpen(
        page,
        workspaceUrl,
        "A11y Empty Project",
        "A11y Empty Client",
      );
      await expect(
        page.getByRole("main").getByText("No updates yet"),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByText("No files yet"),
      ).toBeVisible();
      await checkAccessibility(page, `empty project page (${colorScheme})`);
    });

    test(`a filled project page and a populated dashboard have no WCAG 2 A/AA violations in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      const { workspaceUrl } = await buildFilledWorkspace(
        page,
        `a11y-filled-${colorScheme}`,
        test.info().workerIndex,
      );
      await checkAccessibility(page, `filled project page (${colorScheme})`);

      await page.getByRole("button", { name: /^Delete comment by / }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await checkAccessibility(
        page,
        `delete comment confirmation (${colorScheme})`,
      );
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      await page.goto(workspaceUrl);
      await expect(
        page.getByRole("region", { name: "Recent activity" }).getByRole("list"),
      ).toBeVisible();
      await checkAccessibility(page, `populated dashboard (${colorScheme})`);
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
