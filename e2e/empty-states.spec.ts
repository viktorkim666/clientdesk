import { test, expect } from "@playwright/test";
import {
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

test.describe("empty states", () => {
  test("every empty list explains itself and offers the next action", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "empty-states",
      test.info().workerIndex,
    );
    const main = page.getByRole("main");

    // Dashboard.
    await expect(main.getByText("Start your first project")).toBeVisible();
    await expect(main.getByText("No activity yet")).toBeVisible();
    await main.getByRole("link", { name: "Go to project list" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    // Projects without any client: a client comes first.
    await expect(main.getByText("Start your first project")).toBeVisible();
    await expect(
      main.getByText("Add a client before creating a project."),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "New project" }),
    ).toBeDisabled();
    await main.getByRole("link", { name: "Add a client first" }).click();
    await expect(page).toHaveURL(/\/clients$/);

    // Clients: the button lives inside the empty state, and only there.
    await expect(main.getByText("Add your first client")).toBeVisible();
    await expect(main.getByRole("button", { name: "New client" })).toHaveCount(
      1,
    );
    await createClientViaDialog(page, workspaceUrl, "Empty Flow Client");
    await expect(main.getByText("Add your first client")).toHaveCount(0);

    // Projects with a client: a single, enabled "New project" button.
    await page.goto(`${workspaceUrl}/projects`);
    await expect(main.getByText("Start your first project")).toBeVisible();
    await expect(main.getByRole("button", { name: "New project" })).toHaveCount(
      1,
    );
    await expect(
      main.getByRole("button", { name: "New project" }),
    ).toBeEnabled();

    // Members.
    await page.goto(`${workspaceUrl}/settings/members`);
    await expect(main.getByText("No pending invitations")).toBeVisible();

    // A new project page.
    await createProjectAndOpen(
      page,
      workspaceUrl,
      "Empty Flow Project",
      "Empty Flow Client",
    );
    await expect(main.getByText("No updates yet")).toBeVisible();
    await expect(main.getByText("No files yet")).toBeVisible();
  });
});
