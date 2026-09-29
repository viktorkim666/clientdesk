import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  buildFilledWorkspace,
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

const SAMPLE_PDF_PATH = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample.pdf",
);

test.describe("project page interactions", () => {
  test("deleting a comment asks first, then moves focus to that update's comment form", async ({
    page,
  }) => {
    await buildFilledWorkspace(page, "delete-comment", test.info().workerIndex);
    const body = page.getByText("Looks good to me.");
    const deleteButton = page.getByRole("button", {
      name: /^Delete comment by /,
    });

    // The touch target is at least 24px (WCAG 2.5.8) and stays clear of the
    // comment text.
    const deleteBox = await deleteButton.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(deleteBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    if (deleteBox && bodyBox) {
      expect(deleteBox.width).toBeGreaterThanOrEqual(24);
      expect(deleteBox.height).toBeGreaterThanOrEqual(24);
      expect(
        deleteBox.x < bodyBox.x + bodyBox.width &&
          deleteBox.x + deleteBox.width > bodyBox.x &&
          deleteBox.y < bodyBox.y + bodyBox.height &&
          deleteBox.y + deleteBox.height > bodyBox.y,
        "the delete button covers the comment text",
      ).toBe(false);
    }

    // Cancel keeps the comment and returns focus to the button.
    await deleteButton.click();
    const dialog = page.getByRole("alertdialog", {
      name: "Delete this comment?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(body).toBeVisible();
    await expect(deleteButton).toBeFocused();

    // Confirming removes it and hands focus to the update's comment form.
    await deleteButton.click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(body).toHaveCount(0);
    await expect(page.getByLabel("Write a comment")).toBeFocused();
  });

  test("a failed comment delete shows an alert and returns focus to the delete button", async ({
    page,
  }) => {
    const { projectUrl } = await buildFilledWorkspace(
      page,
      "delete-comment-fail",
      test.info().workerIndex,
    );
    const deleteButton = page.getByRole("button", {
      name: /^Delete comment by /,
    });

    // Fail the server action request, as the network dropping would.
    await page.route(projectUrl, async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await deleteButton.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    await expect(
      page.getByRole("alert").filter({ hasText: "Could not delete" }),
    ).toHaveText("Could not delete the comment");
    await expect(page.getByText("Looks good to me.")).toBeVisible();
    await expect(deleteButton).toBeFocused();
  });

  test("deleting a file asks first, then moves focus to the Files heading", async ({
    page,
  }) => {
    await buildFilledWorkspace(page, "delete-file", test.info().workerIndex);
    const fileRow = page.getByRole("row", { name: /sample\.pdf/ });

    // Each row's buttons are named after their file.
    await expect(
      page.getByRole("button", { name: "Download sample.pdf" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Delete sample.pdf" }).click();
    const dialog = page.getByRole("alertdialog", {
      name: "Delete sample.pdf?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(fileRow).toBeVisible();

    await page.getByRole("button", { name: "Delete sample.pdf" }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(fileRow).toHaveCount(0);
    await expect(page.getByText("No files yet")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Files", level: 2 }),
    ).toBeFocused();
  });

  test("an upload announces its progress and keeps focus on the input", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "upload-status",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Upload Status Client");
    await createProjectAndOpen(
      page,
      workspaceUrl,
      "Upload Status Project",
      "Upload Status Client",
    );

    // Hold the storage request so the pending state can be observed.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let storageRequests = 0;
    await page.route("**/storage/v1/object/**", async (route) => {
      if (route.request().method() === "POST") {
        storageRequests += 1;
        await gate;
      }
      await route.continue();
    });

    // Located by type: the label text turns into "Uploading…" while pending.
    const input = page.locator('input[type="file"]');
    const status = page.getByRole("status");
    await input.focus();
    await input.setInputFiles(SAMPLE_PDF_PATH);

    await expect(status).toHaveText("Uploading sample.pdf…");
    await expect(input).toHaveAttribute("aria-disabled", "true");
    // Playwright's toBeDisabled also honours aria-disabled, so read the DOM
    // property: the input must not be natively disabled or it drops focus.
    expect(
      await input.evaluate(
        (element) => element instanceof HTMLInputElement && element.disabled,
      ),
    ).toBe(false);
    await expect(input).toBeFocused();

    // A pick made while an upload runs is ignored.
    await input.setInputFiles(SAMPLE_PDF_PATH);
    expect(storageRequests).toBe(1);

    release();
    await expect(status).toHaveText("Uploaded sample.pdf");
    await expect(page.getByRole("row", { name: /sample\.pdf/ })).toBeVisible();
    await expect(input).toHaveAttribute("aria-disabled", "false");
    expect(storageRequests).toBe(1);
  });
});
