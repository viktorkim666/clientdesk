import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  readLastInviteUrlFor,
  readLastProjectUpdateEmailFor,
} from "./support/emails";

const SAMPLE_PDF_PATH = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample.pdf",
);

/**
 * Invites a client user for `clientName` from the Members page (the owner
 * page must already be there) and accepts the invitation in a fresh browser
 * context, so the new session doesn't inherit the owner's cookies. Mirrors
 * the invite flow in e2e/roles.spec.ts.
 */
async function inviteAndAcceptClientUser(
  ownerPage: Page,
  browser: Browser,
  {
    email,
    fullName,
    clientName,
  }: { email: string; fullName: string; clientName: string },
): Promise<{ page: Page }> {
  await ownerPage.getByRole("link", { name: "Members" }).click();
  await ownerPage.getByRole("button", { name: "Invite" }).click();
  await ownerPage.getByLabel("Email").fill(email);
  await ownerPage.getByLabel("Role").click();
  await ownerPage.getByRole("option", { name: "Client", exact: true }).click();
  await ownerPage.getByLabel("Client", { exact: true }).click();
  await ownerPage.getByRole("option", { name: clientName }).click();
  await ownerPage.getByRole("button", { name: "Send invitation" }).click();
  // Without an email provider the dialog shows the invite link; close it.
  await ownerPage.getByRole("button", { name: "Done" }).click();
  await expect(ownerPage.getByRole("cell", { name: email })).toBeVisible();

  const inviteUrl = await readLastInviteUrlFor(email);
  const context = await browser.newContext();
  const clientPage = await context.newPage();
  await clientPage.goto(inviteUrl);

  const invitePath = new URL(inviteUrl).pathname;
  await clientPage.goto(`/signup?next=${invitePath}`);
  await clientPage.getByLabel("Full name").fill(fullName);
  await clientPage.getByLabel("Email").fill(email);
  await clientPage.getByLabel("Password").fill("correct-horse-1");
  await clientPage.getByRole("button", { name: "Sign up" }).click();

  await expect(clientPage).toHaveURL(/\/invite\//);
  await clientPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(clientPage).toHaveURL(/\/w\/e2e-projects-agency-[a-z0-9]+$/);

  return { page: clientPage };
}

test.describe("end-to-end project flow", () => {
  test("a client reads an update, downloads a file and comments; another client is denied", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `owner-${suffix}@e2e.clientdesk.test`;
    const clientAEmail = `client-a-${suffix}@e2e.clientdesk.test`;
    const clientBEmail = `client-b-${suffix}@e2e.clientdesk.test`;

    // Base UI warns to the console if a `Select`'s value changes without it
    // being a controlled component; collecting console messages across the
    // whole flow lets the assertion near the end confirm that warning never
    // fires for the status `Select`.
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    // Owner signs up, creates a workspace, two clients and a project for
    // Client A.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Projects Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-projects-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    for (const name of ["Client A Co.", "Client B Co."]) {
      await page.getByRole("button", { name: "New client" }).click();
      await page.getByLabel("Client name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByRole("cell", { name })).toBeVisible();
    }

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Project Alpha");
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: "Client A Co." }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Project Alpha" }),
    ).toBeVisible();

    // Both client users must already exist before the update is posted,
    // since the update email goes to whoever is a client user of the
    // project's client at that point.
    const clientA = await inviteAndAcceptClientUser(page, browser, {
      email: clientAEmail,
      fullName: "E2E Client A User",
      clientName: "Client A Co.",
    });
    const clientB = await inviteAndAcceptClientUser(page, browser, {
      email: clientBEmail,
      fullName: "E2E Client B User",
      clientName: "Client B Co.",
    });

    // Owner opens the project, posts an update, changes the status and
    // uploads a file.
    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("link", { name: "Project Alpha" }).click();
    await expect(
      page.getByRole("heading", { name: "Project Alpha" }),
    ).toBeVisible();
    const projectUrl = page.url();

    await page
      .getByPlaceholder("Post an update for the client...")
      .fill("Initial rollout is live.");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Initial rollout is live.")).toBeVisible();

    await page.getByLabel("Project status").click();
    await page.getByRole("option", { name: "On hold" }).click();
    const statusSelect = page.getByRole("combobox", {
      name: "Project status",
    });
    await expect(statusSelect).toContainText("On hold");
    // The select is disabled while its Server Action is in flight, and the
    // optimistic "On hold" above shows before that action has been sent. Wait
    // for it to settle before intercepting requests below; otherwise the
    // route aborts this first change, which reverts to "Active".
    await expect(statusSelect).toBeEnabled();
    await expect(statusSelect).not.toHaveAttribute("aria-invalid", "true");
    await expect(statusSelect).toContainText("On hold");

    // A failed status change shows an inline error and resyncs the select
    // back to the last server-confirmed status, instead of leaving it on
    // the value the user picked.
    await page.route(projectUrl, (route) => route.abort("failed"));
    await page.getByLabel("Project status").click();
    await page.getByRole("option", { name: "Done" }).click();
    await expect(
      page.getByText("Could not change the project's status"),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Project status" }),
    ).toContainText("On hold");
    await page.unroute(projectUrl);

    // The styled upload zone is the visible label of the hidden native
    // input; the input keeps its accessible name and is the only match.
    const fileInput = page.getByLabel("Upload a file");
    await expect(fileInput).toHaveCount(1);
    await expect(fileInput).toHaveAttribute("type", "file");
    await expect(page.getByText("Upload a file")).toBeVisible();
    await expect(page.getByText(/up to 10 MB/)).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF_PATH);
    await expect(page.getByRole("row", { name: /sample\.pdf/ })).toBeVisible();

    // Client A opens the project: sees the update, the status, the file,
    // downloads it, comments and got the update email.
    await clientA.page.goto(projectUrl);
    await expect(
      clientA.page.getByRole("heading", { name: "Project Alpha" }),
    ).toBeVisible();
    await expect(clientA.page.getByText("On hold")).toBeVisible();
    await expect(
      clientA.page.getByText("Initial rollout is live."),
    ).toBeVisible();
    await expect(
      clientA.page.getByRole("row", { name: /sample\.pdf/ }),
    ).toBeVisible();

    // A failed download shows an inline error on that file's own row,
    // rather than a page-wide error or a permanently disabled table.
    await clientA.page.route(projectUrl, (route) => route.abort("failed"));
    await clientA.page.getByRole("button", { name: "Download" }).click();
    await expect(
      clientA.page.getByText("Could not create a download link"),
    ).toBeVisible();
    await clientA.page.unroute(projectUrl);

    // Supabase's signed download URL serves the object with
    // `Content-Disposition: attachment`, so `window.open` triggers a real
    // browser download (an empty popup tab opens and immediately closes)
    // rather than an inline navigation.
    const [download] = await Promise.all([
      clientA.page.waitForEvent("download"),
      clientA.page.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("sample.pdf");
    const downloadStream = await download.createReadStream();
    const downloadChunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      downloadChunks.push(chunk as Buffer);
    }
    const downloadBody = Buffer.concat(downloadChunks);
    expect(downloadBody.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    await clientA.page
      .getByPlaceholder("Write a comment...")
      .fill("Thanks, looks great!");
    await clientA.page
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await expect(clientA.page.getByText("Thanks, looks great!")).toBeVisible();

    const updateEmail = await readLastProjectUpdateEmailFor(clientAEmail);
    expect(updateEmail.projectName).toBe("Project Alpha");
    expect(updateEmail.body).toBe("Initial rollout is live.");
    expect(updateEmail.projectUrl).toBe(projectUrl);

    // Client B, a member of a different client, gets a 404 for the same
    // project URL.
    await clientB.page.goto(projectUrl);
    await expect(clientB.page.getByText("Page not found")).toBeVisible();

    for (const text of consoleMessages) {
      expect(text).not.toContain(
        "changing the default value state of an uncontrolled",
      );
    }
  });
});
