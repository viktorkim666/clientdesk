import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";
import { startDemo, startSharedDemo } from "./support/demo";

const execFileAsync = promisify(execFile);

// Shown when the sandbox has used its 5 uploads, in the hint under the
// uploader. A refused pick repeats it in a visually hidden alert, so the
// sentence is announced without a second visible copy.
const COUNT_LIMIT_MESSAGE =
  "Demo limit reached: 5 uploads. Uploads are turned off for the rest of this demo.";

// A 1x1 transparent PNG, small enough for any limit.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

// The page also has Next's own route announcer with role="alert", so the
// tests look at the form's alert paragraph.
function alertLine(page: Page) {
  return page.locator('p[role="alert"]');
}

async function openFirstProject(page: Page, workspacePath: string) {
  await page.goto(`${workspacePath}/projects`);
  await page
    .getByRole("link", { name: "Website redesign", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Website redesign" }),
  ).toBeVisible();
}

// The AI draft test and the three upload tests below that need a fresh upload
// count share one sandbox (each sandbox counts toward the hourly cap, see
// e2e/support/global-setup.ts). The AI limit and the upload limit are
// separate counts, and these tests use at most one upload and the 3 drafts.
// The tests run in order: the storage cap test fills the sandbox's object
// quota, so it goes last.
test.describe.configure({ mode: "serial" });

test.describe("demo AI draft limit", () => {
  test("the 4th draft in a sandbox shows an announced message and an editable sample", async ({
    page,
  }) => {
    const workspacePath = await startSharedDemo(page, "agency");
    await openFirstProject(page, workspacePath);

    const draftButton = page.getByRole("button", { name: "Draft update" });
    const textarea = page.getByPlaceholder("Post an update for the client...");

    // The fake generator streams a draft built from the project's activity.
    for (let draft = 1; draft <= 3; draft++) {
      await expect(draftButton).toBeEnabled();
      await draftButton.click();
      await expect(page.getByText("Draft added.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(textarea).toHaveValue(/Here is what happened on/);
    }

    await expect(draftButton).toBeEnabled();
    await draftButton.click();

    // The limit note is a polite status, not an alert: it is information, the
    // visitor has not made a mistake.
    const message = page
      .getByRole("status")
      .filter({ hasText: "Sample draft" });
    await expect(message).toContainText(
      "You've used the 3 AI drafts in this demo. Here's a sample draft you can still edit and publish.",
    );
    await expect(message).toContainText("Sample draft");
    await expect(textarea).toHaveValue(
      /This week we kept working through the open items/,
    );
    await expect(textarea).not.toHaveValue(/Here is what happened on/);
    // Another click would only replace the sample, so the button waits.
    await expect(draftButton).toBeDisabled();

    // The sample is the visitor's to edit and publish.
    const edited = "Sample edited by the visitor and published.";
    await textarea.fill(edited);
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText(edited)).toBeVisible();
    await expect(message).toHaveCount(0);
  });
});

test.describe("demo upload limits", () => {
  test("a small PNG uploads and the drop zone states the demo limits", async ({
    page,
  }) => {
    const workspacePath = await startSharedDemo(page, "agency");
    await openFirstProject(page, workspacePath);

    await expect(
      page.getByText("Demo: up to 5 files, 2 MB each, images or PDF"),
    ).toBeVisible();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "demo-upload.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect(
      page.getByRole("status").getByText("Uploaded demo-upload.png"),
    ).toBeAttached({ timeout: 15_000 });
    await expect(page.getByText("demo-upload.png").first()).toBeVisible();
    await expect(alertLine(page)).toHaveCount(0);
  });

  test("a file over 2 MB is refused with a message tied to the input", async ({
    page,
  }) => {
    const workspacePath = await startSharedDemo(page, "agency");
    await openFirstProject(page, workspacePath);

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "too-big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(3 * 1024 * 1024, 1),
    });

    const alert = alertLine(page);
    await expect(alert).toHaveText(
      "This file is over 2 MB, the limit in this demo. Choose a smaller one.",
    );
    // A real error stays a visible red alert.
    await expect(alert).toHaveClass(/\btext-destructive\b/);
    const alertId = await alert.getAttribute("id");
    expect(alertId).toBeTruthy();
    await expect(input).toHaveAttribute(
      "aria-describedby",
      new RegExp(`${alertId}`),
    );
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("too-big.png")).toHaveCount(0);
  });

  test("a text file is refused, and so is a 6th upload", async ({ page }) => {
    const workspacePath = await startDemo(page, "agency");
    await openFirstProject(page, workspacePath);

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await expect(alertLine(page)).toHaveText(
      "In this demo, files must be an image (PNG, JPEG, WebP or GIF) or a PDF.",
    );

    for (let upload = 1; upload <= 5; upload++) {
      // The input is aria-disabled while an upload runs, and a pick made
      // then is dropped by design, so wait for it to settle.
      await expect(input).toHaveAttribute("aria-disabled", "false");
      await input.setInputFiles({
        name: `limit-${upload}.png`,
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
      await expect(
        page.getByRole("status").getByText(`Uploaded limit-${upload}.png`),
      ).toBeAttached({ timeout: 15_000 });
      // The page refreshes with the new count before the next pick.
      await expect(page.getByText(`limit-${upload}.png`).first()).toBeVisible();
    }

    await expect(page.getByText(COUNT_LIMIT_MESSAGE)).toBeVisible();

    // The input is also aria-disabled while an upload runs, and a pick made
    // then is dropped by design. Wait until the "Uploading" label and status
    // have cleared, so the 6th pick below reaches the limit check.
    await expect(page.getByText(/^Uploading/)).toHaveCount(0);

    // At the limit the input stays focusable but is marked disabled.
    await expect(input).toHaveAttribute("aria-disabled", "true");
    await input.setInputFiles({
      name: "limit-6.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(alertLine(page)).toHaveText(COUNT_LIMIT_MESSAGE);
    // The hint carries the message on screen; the alert is only announced.
    await expect(alertLine(page)).toHaveClass(/\bsr-only\b/);
    await expect(page.getByText("limit-6.png")).toHaveCount(0);

    // Clicking the drop zone at the limit is stopped and says why, instead of
    // opening a file picker that could only be refused.
    // Playwright treats a control inside an aria-disabled input's label as
    // not enabled, so the click is forced; a visitor's click works the same.
    await page.getByText("Upload a file").click({ force: true });
    await expect(alertLine(page)).toHaveText(COUNT_LIMIT_MESSAGE);

    // Deleting an upload does not give the slot back: the database counts
    // every upload for the life of the sandbox.
    await page
      .getByRole("button", { name: "Delete limit-1.png", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText("limit-1.png")).toHaveCount(0);
    await expect(input).toHaveAttribute("aria-disabled", "true");
    await input.setInputFiles({
      name: "after-delete.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(alertLine(page)).toHaveText(COUNT_LIMIT_MESSAGE);
    await expect(page.getByText("after-delete.png")).toHaveCount(0);
  });

  test("a direct upload past the storage cap is refused by Storage and explained", async ({
    page,
  }) => {
    // Runs after the PNG upload above, in the same sandbox, so the visitor
    // has 1 of 5 uploads and the page still lets them pick a file.
    const workspacePath = await startSharedDemo(page, "agency");
    await fillStorageToItsCap(workspacePath);
    await openFirstProject(page, workspacePath);

    const refusals: { status: number; statusCode: unknown }[] = [];
    page.on("response", async (response) => {
      if (
        response.request().method() === "POST" &&
        response.url().includes("/storage/v1/object/project-files/")
      ) {
        const body: unknown = await response.json();
        refusals.push({
          status: response.status(),
          statusCode:
            typeof body === "object" && body !== null && "statusCode" in body
              ? body.statusCode
              : undefined,
        });
      }
    });

    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("aria-disabled", "false");
    await input.setInputFiles({
      name: "past-the-cap.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await expect(alertLine(page)).toHaveText(
      `Could not upload the file. ${COUNT_LIMIT_MESSAGE}`,
    );
    await expect(page.getByText("past-the-cap.png")).toHaveCount(0);
    // What the local Storage returns for a refused insert policy: HTTP 400
    // with "403" in the body's statusCode. The uploader reads the body's
    // code (StorageError.statusCode), not the HTTP status, so a 400 is
    // recognized as the policy refusal.
    await expect
      .poll(() => refusals)
      .toEqual([{ status: 400, statusCode: "403" }]);
  });
});

// A sandbox may hold its template copies plus 5 objects per workspace in
// Storage. This adds orphaned objects (no file row, no ledger entry) up to
// that cap, so the next upload passes the uploader's own check, which counts
// registered uploads, and is refused by the storage policy.
async function fillStorageToItsCap(workspacePath: string) {
  const slug = /^\/w\/([a-z0-9-]+)$/.exec(workspacePath)?.[1];
  if (!slug) {
    throw new Error(`Unexpected workspace path ${workspacePath}`);
  }
  await execFileAsync("pnpm", [
    "supabase",
    "db",
    "query",
    "--local",
    `insert into storage.objects (bucket_id, name)
     select 'project-files', format('%s/%s/%s/orphan-%s.png', w.id, p.id, gen_random_uuid(), g)
     from public.workspaces w
     cross join lateral (
       select id from public.projects where workspace_id = w.id order by id limit 1
     ) p
     cross join lateral generate_series(1, greatest(0,
       (select count(*) from public.project_files f where f.workspace_id = w.id and not f.uploaded_in_demo)
       + 5
       - (select count(*) from storage.objects o where o.bucket_id = 'project-files' and lower(o.name) like w.id::text || '/%')
     )) g
     where w.slug = '${slug}'`,
  ]);
}
