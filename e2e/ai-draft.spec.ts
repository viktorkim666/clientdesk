import { test, expect } from "@playwright/test";
import { login } from "./support/auth";
import {
  readLastInviteUrlFor,
  readLastProjectUpdateEmailFor,
} from "./support/emails";

// The seeded Pro workspace from supabase/seed.sql: e2e has no Stripe keys
// and no service-role key to flip a workspace to Pro at runtime, so this
// one is already on the Pro plan before the suite runs. See the spec's own
// tests below for why only the owner is fixed and everything else (clients,
// projects, staff and client users) is created fresh per run.
//
// Every run through the first test below spends one of this workspace's 50
// claim_ai_draft calls per day (see supabase/migrations, ai_draft_requests).
// Playwright's globalSetup (e2e/support/global-setup.ts) clears that
// workspace's rows before the suite runs, so reruns can't exhaust the cap.
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";

test.describe("AI draft update", () => {
  test("a Pro staff member drafts, edits and posts an update from recent activity, and a client is refused both the button and the route", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const memberEmail = `ai-draft-member-${suffix}@e2e.clientdesk.test`;
    const clientEmail = `ai-draft-client-${suffix}@e2e.clientdesk.test`;
    const clientName = `AI Draft Client ${suffix}`;
    const projectName = `AI Draft Project ${suffix}`;
    const initialUpdateBody = "Kickoff call went well, build starts Monday.";
    const commentBody = "Great, looking forward to it!";
    const editedUpdateBody =
      "Kickoff call went well, build starts Monday. Edited by the team.";

    // The seeded Pro owner signs in and sets up a fresh client and project
    // for this run (a fresh project keeps this run's activity from leaking
    // into another run's "no activity" assertion, and the owner never
    // clicks "Draft update" itself, so its own per-user rate limit window
    // stays empty).
    await login(page, PRO_OWNER_EMAIL);
    const workspaceUrl = page.url();

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill(clientName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: clientName })).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: projectName }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();
    const projectUrl = page.url();

    // The owner posts the update that becomes this project's activity.
    await page
      .getByPlaceholder("Post an update for the client...")
      .fill(initialUpdateBody);
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText(initialUpdateBody)).toBeVisible();

    // A fresh staff member is invited into the Pro workspace: a new user id
    // every run keeps this test's "Draft update" claim off the seeded
    // owner's rate-limit window across reruns, the same way every other
    // e2e spec here signs up fresh users instead of reusing one.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Role", { exact: true }).click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("cell", { name: memberEmail })).toBeVisible();
    const memberInviteUrl = await readLastInviteUrlFor(memberEmail);

    // A fresh client user for the new client, so it also gets the update
    // email once the member posts the edited draft below.
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByLabel("Role", { exact: true }).click();
    await page.getByRole("option", { name: "Client", exact: true }).click();
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("cell", { name: clientEmail })).toBeVisible();
    const clientInviteUrl = await readLastInviteUrlFor(clientEmail);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/signup?next=${new URL(memberInviteUrl).pathname}`);
    await memberPage.getByLabel("Full name").fill("E2E AI Draft Member");
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByLabel("Password").fill("correct-horse-1");
    await memberPage.getByRole("button", { name: "Sign up" }).click();
    await expect(memberPage).toHaveURL(/\/invite\//);
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(memberPage).toHaveURL(workspaceUrl);

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await clientPage.goto(`/signup?next=${new URL(clientInviteUrl).pathname}`);
    await clientPage.getByLabel("Full name").fill("E2E AI Draft Client");
    await clientPage.getByLabel("Email").fill(clientEmail);
    await clientPage.getByLabel("Password").fill("correct-horse-1");
    await clientPage.getByRole("button", { name: "Sign up" }).click();
    await expect(clientPage).toHaveURL(/\/invite\//);
    await clientPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(clientPage).toHaveURL(workspaceUrl);

    // The client comments, rounding out this project's recent activity.
    await clientPage.goto(projectUrl);
    await clientPage.getByPlaceholder("Write a comment...").fill(commentBody);
    await clientPage
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await expect(clientPage.getByText(commentBody)).toBeVisible();

    // The member drafts an update: the button is enabled (Pro, configured),
    // and the fake generator (no ANTHROPIC_API_KEY, non-production) streams
    // a draft built from this project's name and its recent activity.
    await memberPage.goto(projectUrl);
    const draftButton = memberPage.getByRole("button", {
      name: "Draft update",
    });
    await expect(draftButton).toBeEnabled();
    await draftButton.click();

    const textarea = memberPage.getByPlaceholder(
      "Post an update for the client...",
    );
    // Streaming is done once the button reverts from "Stop" back to
    // "Draft update".
    await expect(draftButton).toBeVisible({ timeout: 15_000 });
    await expect(textarea).toHaveValue(new RegExp(projectName));
    await expect(textarea).toHaveValue(new RegExp(initialUpdateBody));
    await expect(textarea).toHaveValue(new RegExp(commentBody));
    await expect(memberPage.getByText("Draft added.")).toBeVisible();

    // The member edits the draft before posting it.
    await textarea.fill(editedUpdateBody);
    await memberPage.getByRole("button", { name: "Post update" }).click();
    await expect(memberPage.getByText(editedUpdateBody)).toBeVisible();

    // The console email sender appends its record from inside the same
    // server action this already-visible feed item came from, so it should
    // already be on disk - but this reads it from a separate process (the
    // file, not an in-memory signal from the request), so a short retry
    // absorbs that gap the same way `toBeVisible`'s own polling would for a
    // DOM change.
    type UpdateEmail = Awaited<
      ReturnType<typeof readLastProjectUpdateEmailFor>
    >;
    const updateEmailBox: { current: UpdateEmail | null } = { current: null };
    await expect(async () => {
      const email = await readLastProjectUpdateEmailFor(clientEmail);
      expect(email.body).toBe(editedUpdateBody);
      updateEmailBox.current = email;
    }).toPass({ timeout: 10_000 });
    expect(updateEmailBox.current?.projectName).toBe(projectName);
    expect(updateEmailBox.current?.projectUrl).toBe(projectUrl);

    // The client sees no "Draft update" button at all...
    await clientPage.goto(projectUrl);
    await expect(
      clientPage.getByRole("button", { name: "Draft update" }),
    ).toHaveCount(0);

    // ...and a direct POST to the route from the client's own browser
    // context (carrying its session cookies) is refused the same way the
    // project page itself would be: 404, not 401 or 403, so the response
    // never confirms the project exists to a caller who can't draft on it.
    const directResponse = await clientPage.request.post(
      `/api/projects/${projectUrl.split("/").pop()}/draft-update`,
    );
    expect(directResponse.status()).toBe(404);

    await memberContext.close();
    await clientContext.close();
  });

  test("a project with no recent activity shows the empty-activity message instead of a draft", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const clientName = `AI Draft Quiet Client ${suffix}`;
    const projectName = `AI Draft Quiet Project ${suffix}`;

    await login(page, PRO_OWNER_EMAIL);

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill(clientName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: clientName })).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: projectName })).toBeVisible();

    // A brand-new project has never had an update, comment or file, so
    // there is nothing within the last 7 days for the route to draft from.
    await page.getByRole("link", { name: projectName }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Draft update" }).click();
    await expect(
      page
        .getByRole("alert")
        .getByText("Nothing happened on this project in the last 7 days."),
    ).toBeVisible();
  });

  test("a Free workspace staff member sees a disabled Draft button with a Pro badge and an upgrade link", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `ai-draft-free-owner-${suffix}@e2e.clientdesk.test`;
    const clientName = "Free Plan Client";
    const projectName = "Free Plan Project";

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Free Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E AI Draft Free Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-ai-draft-free-agency-[a-z0-9]+$/);
    const workspaceUrl = page.url();

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill(clientName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: clientName })).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: projectName }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Draft update" }),
    ).toBeDisabled();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
    const upgradeLink = page.getByRole("link", { name: "Upgrade" });
    await expect(upgradeLink).toBeVisible();
    await expect(upgradeLink).toHaveAttribute(
      "href",
      `${new URL(workspaceUrl).pathname}/settings/billing`,
    );
  });
});
