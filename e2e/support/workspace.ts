import path from "node:path";
import { expect, type Page } from "@playwright/test";

const SAMPLE_PDF_PATH = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample.pdf",
);

/**
 * Signs up a fresh owner with a unique email and creates a workspace, so the
 * caller lands on a workspace with no clients, projects or activity. Returns
 * the workspace URL.
 */
export async function signUpOwnerWithEmptyWorkspace(
  page: Page,
  prefix: string,
  workerIndex: number,
): Promise<string> {
  const email = `${prefix}-${Date.now()}-${workerIndex}@e2e.clientdesk.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Empty State Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-1");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("Workspace name").fill("Empty Workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/);
  return page.url();
}

/** Creates a client through the dialog on the Clients page (by URL). */
export async function createClientViaDialog(
  page: Page,
  workspaceUrl: string,
  clientName: string,
) {
  await page.goto(`${workspaceUrl}/clients`);
  await page.getByRole("button", { name: "New client" }).click();
  await page.getByLabel("Client name").fill(clientName);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: clientName })).toBeVisible();
}

/**
 * Creates a project for an existing client through the dialog and opens its
 * page. Returns the project page URL.
 */
export async function createProjectAndOpen(
  page: Page,
  workspaceUrl: string,
  projectName: string,
  clientName: string,
): Promise<string> {
  await page.goto(`${workspaceUrl}/projects`);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Client").click();
  await page.getByRole("option", { name: clientName }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: projectName }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  return page.url();
}

/** On a project page: posts one update, one comment on it and uploads a PDF. */
export async function fillProjectPage(page: Page) {
  await page
    .getByPlaceholder("Post an update for the client...")
    .fill("Design review is done.");
  await page.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Design review is done.")).toBeVisible();

  await page.getByPlaceholder("Write a comment...").fill("Looks good to me.");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByText("Looks good to me.")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF_PATH);
  await expect(page.getByRole("row", { name: /sample\.pdf/ })).toBeVisible();
}

/**
 * Builds a workspace with one client, one project and a project page holding
 * an update, a comment and a file. Returns the workspace and project URLs.
 */
export async function buildFilledWorkspace(
  page: Page,
  prefix: string,
  workerIndex: number,
): Promise<{ workspaceUrl: string; projectUrl: string }> {
  const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
    page,
    prefix,
    workerIndex,
  );
  await createClientViaDialog(page, workspaceUrl, "Filled Client Co.");
  const projectUrl = await createProjectAndOpen(
    page,
    workspaceUrl,
    "Filled Project",
    "Filled Client Co.",
  );
  await fillProjectPage(page);
  return { workspaceUrl, projectUrl };
}
