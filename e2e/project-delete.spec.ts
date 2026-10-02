import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { login } from "./support/auth";
import { startDemo } from "./support/demo";
import { parseDbQueryRows } from "./support/db-query";
import {
  buildFilledWorkspace,
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

const execFileAsync = promisify(execFile);

const SAMPLE_PDF_PATH = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample.pdf",
);

// A 1x1 transparent PNG, small enough for any demo limit.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const COUNT_SCHEMA = z.object({ n: z.number() });

// The local database, queried straight from the spec to check what the UI
// cannot show (Storage objects, ledger rows). Every value interpolated into
// the SQL below is a slug or a UUID taken from a URL and checked first.
async function countRows(sql: string): Promise<number> {
  const { stdout } = await execFileAsync("pnpm", [
    "supabase",
    "db",
    "query",
    "--local",
    "-o",
    "json",
    sql,
  ]);
  const [row] = parseDbQueryRows(stdout, COUNT_SCHEMA);
  return row.n;
}

async function runSql(sql: string) {
  await execFileAsync("pnpm", ["supabase", "db", "query", "--local", sql]);
}

function slugOf(workspaceUrl: string): string {
  const slug = /\/w\/([a-z0-9-]+)(?:\/|$)/.exec(workspaceUrl)?.[1];
  if (!slug) {
    throw new Error(`No workspace slug in ${workspaceUrl}`);
  }
  return slug;
}

function projectIdOf(projectUrl: string): string {
  const id = /\/projects\/([0-9a-f-]{36})$/.exec(projectUrl)?.[1];
  if (!id) {
    throw new Error(`No project id in ${projectUrl}`);
  }
  return id;
}

async function workspaceIdOf(workspaceUrl: string): Promise<string> {
  const slug = slugOf(workspaceUrl);
  const { stdout } = await execFileAsync("pnpm", [
    "supabase",
    "db",
    "query",
    "--local",
    "-o",
    "json",
    `select id::text as id from public.workspaces where slug = '${slug}'`,
  ]);
  const [row] = parseDbQueryRows(stdout, z.object({ id: z.uuid() }));
  return row.id;
}

function objectsUnder(workspaceId: string, projectId: string): Promise<number> {
  return countRows(
    `select count(*)::int as n from storage.objects
     where bucket_id = 'project-files' and name like '${workspaceId}/${projectId}/%'`,
  );
}

function deleteDialog(page: Page) {
  return page.getByRole("alertdialog");
}

function confirmButton(page: Page) {
  return deleteDialog(page).getByRole("button", {
    name: /^(Delete project|Deleting\.\.\.)$/,
  });
}

test.describe("deleting a project", () => {
  test("an owner deletes a project with an update, a comment and a file, and its Storage object goes too", async ({
    page,
  }) => {
    const { workspaceUrl, projectUrl } = await buildFilledWorkspace(
      page,
      "project-delete",
      test.info().workerIndex,
    );
    const workspaceId = await workspaceIdOf(workspaceUrl);
    const projectId = projectIdOf(projectUrl);
    expect(await objectsUnder(workspaceId, projectId)).toBe(1);

    await page.getByRole("button", { name: "Delete project" }).click();
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        'This permanently deletes "Filled Project" and everything in it: 1 update, 1 comment and 1 file. Filled Client Co. will no longer see it. This cannot be undone.',
      ),
    ).toBeVisible();

    // Confirm stays disabled for an empty and for a wrong name, and the match
    // forgives spaces but not case.
    const input = dialog.getByLabel("Type the project name to confirm");
    await expect(input).toBeFocused();
    await expect(confirmButton(page)).toBeDisabled();
    await input.fill("Filled");
    await expect(confirmButton(page)).toBeDisabled();
    await input.fill("filled project");
    await expect(confirmButton(page)).toBeDisabled();
    await input.fill("  Filled   Project ");
    await expect(confirmButton(page)).toBeEnabled();

    await confirmButton(page).click();
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);
    await expect(
      page.getByRole("link", { name: "Filled Project" }),
    ).toHaveCount(0);

    // The page streams, so the status is already 200 when it finds no row;
    // the not-found page is what the visitor sees.
    await page.goto(projectUrl);
    await expect(page.getByText("Page not found")).toBeVisible();

    expect(await objectsUnder(workspaceId, projectId)).toBe(0);
    expect(
      await countRows(
        `select count(*)::int as n from public.project_files where project_id = '${projectId}'`,
      ),
    ).toBe(0);
  });

  test("an object with no file row is removed too", async ({ page }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-orphan",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Orphan Client");
    const projectUrl = await createProjectAndOpen(
      page,
      workspaceUrl,
      "Orphan Project",
      "Orphan Client",
    );
    const workspaceId = await workspaceIdOf(workspaceUrl);
    const projectId = projectIdOf(projectUrl);

    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PDF_PATH);
    await expect(page.getByRole("row", { name: /sample\.pdf/ })).toBeVisible();
    expect(await objectsUnder(workspaceId, projectId)).toBe(1);

    // The upload landed in Storage but was never registered (or its row is
    // gone): only the folder listing can find it.
    await runSql(
      `delete from public.project_files where project_id = '${projectId}'`,
    );
    expect(await objectsUnder(workspaceId, projectId)).toBe(1);

    await page.reload();
    await page.getByRole("button", { name: "Delete project" }).click();
    await deleteDialog(page)
      .getByLabel("Type the project name to confirm")
      .fill("Orphan Project");
    await confirmButton(page).click();
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);

    expect(await objectsUnder(workspaceId, projectId)).toBe(0);
  });

  test("a project whose file row has no object can still be deleted", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-ghost",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Ghost Client");
    const projectUrl = await createProjectAndOpen(
      page,
      workspaceUrl,
      "Ghost Project",
      "Ghost Client",
    );
    const workspaceId = await workspaceIdOf(workspaceUrl);
    const projectId = projectIdOf(projectUrl);

    // A row that points under the project's prefix, with nothing uploaded.
    await runSql(
      `insert into public.project_files
         (workspace_id, project_id, storage_path, name, size_bytes, mime_type)
       values ('${workspaceId}', '${projectId}',
         '${workspaceId}/${projectId}/${crypto.randomUUID()}/ghost.pdf',
         'ghost.pdf', 1024, 'application/pdf')`,
    );
    expect(await objectsUnder(workspaceId, projectId)).toBe(0);
    expect(
      await countRows(
        `select count(*)::int as n from public.project_files where project_id = '${projectId}'`,
      ),
    ).toBe(1);

    await page.reload();
    await page.getByRole("button", { name: "Delete project" }).click();
    await deleteDialog(page)
      .getByLabel("Type the project name to confirm")
      .fill("Ghost Project");
    await confirmButton(page).click();

    await expect(page).toHaveURL(`${workspaceUrl}/projects`);
    expect(
      await countRows(
        `select count(*)::int as n from public.projects where id = '${projectId}'`,
      ),
    ).toBe(0);
  });

  test("an empty project says so, and Cancel keeps the project, clears the typed name and returns focus to the button", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-cancel",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Cancel Client");
    const projectUrl = await createProjectAndOpen(
      page,
      workspaceUrl,
      "Cancel Project",
      "Cancel Client",
    );

    const trigger = page.getByRole("button", { name: "Delete project" });
    await trigger.click();
    const dialog = deleteDialog(page);
    await expect(
      dialog.getByText(
        'This permanently deletes "Cancel Project". It has no updates, comments or files. This cannot be undone.',
      ),
    ).toBeVisible();
    const input = dialog.getByLabel("Type the project name to confirm");
    await input.fill("Cancel Project");
    await expect(confirmButton(page)).toBeEnabled();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(projectUrl);

    await trigger.click();
    await expect(input).toHaveValue("");
    await expect(confirmButton(page)).toBeDisabled();
    await expect(input).toBeFocused();
  });

  test("the dialog cannot be dismissed while the delete runs", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-pending",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Pending Client");
    const projectUrl = await createProjectAndOpen(
      page,
      workspaceUrl,
      "Pending Project",
      "Pending Client",
    );

    // Holds the Server Action request until the test lets it through.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === new URL(projectUrl).pathname,
      async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"]) {
          await gate;
        }
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "Delete project" }).click();
    const dialog = deleteDialog(page);
    const input = dialog.getByLabel("Type the project name to confirm");
    await input.fill("Pending Project");
    await confirmButton(page).click();

    await expect(
      dialog.getByRole("button", { name: "Deleting..." }),
    ).toBeDisabled();
    await expect(input).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    // Still pending after Escape: the delete has not finished.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(input).toBeDisabled();

    release();
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);
  });

  test("a successful delete shows no error while the navigation to Projects is in flight", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-redirect",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Redirect Client");
    await createProjectAndOpen(
      page,
      workspaceUrl,
      "Redirect Project",
      "Redirect Client",
    );

    // Slows every RSC request for the Projects list, so the navigation that
    // follows the delete stays in flight for a while.
    const projectsPathname = new URL(`${workspaceUrl}/projects`).pathname;
    await page.route(
      (url) => url.pathname === projectsPathname,
      async (route) => {
        if (route.request().method() === "GET") {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "Delete project" }).click();
    const dialog = deleteDialog(page);
    await dialog
      .getByLabel("Type the project name to confirm")
      .fill("Redirect Project");

    // The dialog is gone from the page by the time the navigation ends, so an
    // error that flashes in between is recorded as it appears.
    await page.evaluate(() => {
      const seen: string[] = [];
      Object.assign(window, { seenDialogAlerts: seen });
      new MutationObserver(() => {
        for (const node of document.querySelectorAll(
          '[role="alertdialog"] [role="alert"]',
        )) {
          seen.push(node.textContent ?? "");
        }
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });

    await confirmButton(page).click();
    await expect(
      dialog.getByRole("button", { name: "Deleting..." }),
    ).toBeDisabled();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);

    const seen = await page.evaluate(
      () =>
        Object.entries(window).find(([key]) => key === "seenDialogAlerts")?.[1],
    );
    expect(seen).toEqual([]);
  });

  test("a failed request shows an error tied to the name field and re-enables the dialog", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "project-delete-failed",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Failed Client");
    const projectUrl = await createProjectAndOpen(
      page,
      workspaceUrl,
      "Failed Project",
      "Failed Client",
    );

    await page.route(
      (url) => url.pathname === new URL(projectUrl).pathname,
      async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"]) {
          await route.abort();
          return;
        }
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "Delete project" }).click();
    const dialog = deleteDialog(page);
    const input = dialog.getByLabel("Type the project name to confirm");
    await input.fill("Failed Project");
    await confirmButton(page).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "Could not delete the project. Reload the page and try again.",
    );
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(
      /Failed Project.*Could not delete the project/,
    );
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await expect(page).toHaveURL(projectUrl);
  });

  test("a client does not see Delete project", async ({ page }) => {
    await login(page, "client-a@clientdesk.test");
    await page.getByRole("link", { name: "Projects" }).click();
    await page
      .getByRole("link", { name: "Client A Website Redesign", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Client A Website Redesign" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Delete project" }),
    ).toHaveCount(0);
  });

  test("a demo visitor deletes the template project in their own sandbox, and the upload count stays the same", async ({
    page,
  }) => {
    const workspacePath = await startDemo(page, "agency");
    const slug = slugOf(workspacePath);
    const usedUploads = () =>
      countRows(
        `select count(*)::int as n from public.demo_upload_usage u
         join public.demo_sandboxes s on s.id = u.sandbox_id
         join public.workspaces w on w.id in (s.workspace_id, s.free_workspace_id)
         where w.slug = '${slug}'`,
      );

    await page.goto(`${workspacePath}/projects`);
    await page
      .getByRole("link", { name: "Website redesign", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Website redesign" }),
    ).toBeVisible();
    const projectUrl = page.url();

    await page.locator('input[type="file"]').setInputFiles({
      name: "demo-upload.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByText("demo-upload.png").first()).toBeVisible({
      timeout: 15_000,
    });
    const before = await usedUploads();
    expect(before).toBe(1);

    await page.getByRole("button", { name: "Delete project" }).click();
    await deleteDialog(page)
      .getByLabel("Type the project name to confirm")
      .fill("Website redesign");
    await confirmButton(page).click();
    await expect(page).toHaveURL(`${workspacePath}/projects`);

    // The page streams, so the status is already 200 when it finds no row;
    // the not-found page is what the visitor sees.
    await page.goto(projectUrl);
    await expect(page.getByText("Page not found")).toBeVisible();
    expect(await usedUploads()).toBe(before);
  });
});
