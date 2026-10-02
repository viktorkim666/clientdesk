import { expect, test, type Page } from "@playwright/test";
import { login } from "./support/auth";
import {
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

function actionsButton(page: Page, clientName: string) {
  return page.getByRole("button", { name: `Actions for ${clientName}` });
}

async function chooseFromMenu(page: Page, clientName: string, item: string) {
  await actionsButton(page, clientName).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("renaming a client", () => {
  test("renames a client, shows the new name across the workspace and returns focus to its actions button", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-rename",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Old Name Co.");
    await createProjectAndOpen(
      page,
      workspaceUrl,
      "Rename Project",
      "Old Name Co.",
    );
    await page.goto(`${workspaceUrl}/clients`);

    await chooseFromMenu(page, "Old Name Co.", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename client" });
    await expect(dialog).toBeVisible();
    // The menu hands focus back to its trigger as it closes; the dialog must
    // end up owning it.
    const input = dialog.getByLabel("Client name");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Old Name Co.");

    await input.fill("  New Name Co.  ");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(
      page.getByRole("cell", { name: "New Name Co.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Old Name Co.", exact: true }),
    ).toHaveCount(0);
    await expect(actionsButton(page, "New Name Co.")).toBeFocused();

    await page.getByRole("link", { name: "Projects" }).click();
    await expect(
      page.getByRole("cell", { name: "New Name Co.", exact: true }),
    ).toBeVisible();
  });

  test("keeps the rename dialog open with an inline error for a blank name", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-rename-blank",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Blank Test Co.");

    await chooseFromMenu(page, "Blank Test Co.", "Rename");
    const dialog = page.getByRole("dialog", { name: "Rename client" });
    const input = dialog.getByLabel("Client name");
    await input.fill("   ");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "Client name is required",
    );
    await expect(dialog).toBeVisible();
    // The error is about what the user typed, so the field keeps it.
    await expect(input).toHaveValue("   ");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("Client name is required");

    // A name over 100 characters reaches the server too, and the field keeps
    // all of it.
    const tooLong = "x".repeat(101);
    await input.fill(tooLong);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Keep it under 100 characters",
    );
    await expect(input).toHaveValue(tooLong);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Blank Test Co.", exact: true }),
    ).toBeVisible();
    await expect(actionsButton(page, "Blank Test Co.")).toBeFocused();
  });
});

test.describe("deleting a client", () => {
  test("deletes an empty client, frees the Free plan slot and moves focus to New client", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-delete",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Keep Co.");
    await createClientViaDialog(page, workspaceUrl, "Remove Co.");
    await expect(page.getByText("2 / 2 clients used.")).toBeVisible();
    await expect(page.getByText("Limit reached")).toBeVisible();

    await chooseFromMenu(page, "Remove Co.", "Delete");
    const dialog = page.getByRole("alertdialog", {
      name: "Delete Remove Co.?",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "The client is removed from this workspace and can't be restored.",
      ),
    ).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await dialog.getByRole("button", { name: "Delete client" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(
      page.getByRole("cell", { name: "Remove Co.", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Keep Co.", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1 / 2 clients used.")).toBeVisible();
    await expect(page.getByText("Limit reached")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New client" }),
    ).toBeFocused();
  });

  test("Cancel keeps the client and returns focus to its actions button", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-delete-cancel",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Stay Co.");

    await chooseFromMenu(page, "Stay Co.", "Delete");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Stay Co.", exact: true }),
    ).toBeVisible();
    await expect(actionsButton(page, "Stay Co.")).toBeFocused();
  });

  test("the confirmation stays open and locked while the delete runs", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-delete-pending",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Slow Co.");
    await createClientViaDialog(page, workspaceUrl, "Other Co.");

    // Holds the Server Action request until the test lets it through.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === new URL(`${workspaceUrl}/clients`).pathname,
      async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"]) {
          await gate;
        }
        await route.continue();
      },
    );

    await chooseFromMenu(page, "Slow Co.", "Delete");
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete client" }).click();

    await expect(
      dialog.getByRole("button", { name: "Deleting..." }),
    ).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    // Still pending after Escape: the delete has not finished.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Deleting..." }),
    ).toBeDisabled();

    release();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "Slow Co.", exact: true }),
    ).toHaveCount(0);
  });

  test("shows the empty state, with focus on New client, after the last client is deleted", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-delete-last",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Only Co.");

    await chooseFromMenu(page, "Only Co.", "Delete");
    await page.getByRole("button", { name: "Delete client" }).click();

    await expect(page.getByText("Add your first client")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New client" }),
    ).toBeFocused();
  });

  test("a client with a project is blocked, links to Projects, and can be deleted after its last project is", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "client-delete-blocked",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, "Busy Co.");
    await createProjectAndOpen(page, workspaceUrl, "Busy Project", "Busy Co.");
    await page.goto(`${workspaceUrl}/clients`);

    await chooseFromMenu(page, "Busy Co.", "Delete");
    const dialog = page.getByRole("dialog", { name: "Can't delete Busy Co." });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        "Busy Co. has 1 project. Delete it first, then delete the client.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Open Projects" }),
    ).toHaveAttribute("href", new URL(`${workspaceUrl}/projects`).pathname);
    await expect(
      dialog.getByRole("link", { name: "Open Members" }),
    ).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(1);
    // A screen reader announces the reasons with the title, not only the title.
    await expect(dialog).toHaveAccessibleDescription(
      /Busy Co\. has 1 project\. Delete it first, then delete the client\./,
    );

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(actionsButton(page, "Busy Co.")).toBeFocused();
    await expect(
      page.getByRole("cell", { name: "Busy Co.", exact: true }),
    ).toBeVisible();

    await chooseFromMenu(page, "Busy Co.", "Delete");
    await page.getByRole("link", { name: "Open Projects" }).click();
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);

    // Delete the project through its page, as a user would.
    await page.getByRole("link", { name: "Busy Project" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await page
      .getByRole("alertdialog")
      .getByLabel("Type the project name to confirm")
      .fill("Busy Project");
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete project" })
      .click();
    await expect(page).toHaveURL(`${workspaceUrl}/projects`);

    await page.goto(`${workspaceUrl}/clients`);
    await chooseFromMenu(page, "Busy Co.", "Delete");
    await expect(
      page.getByRole("alertdialog", { name: "Delete Busy Co.?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete client" }).click();
    await expect(page.getByText("Add your first client")).toBeVisible();
  });
});

// Seeded Acme: Client A Inc. has a project and a person who signs in as it.
// Both dialogs are opened and closed; nothing is deleted.
test.describe("a client with people (seeded, read only)", () => {
  async function openBlocked(page: Page, email: string) {
    await login(page, email);
    await page.getByRole("link", { name: "Clients" }).click();
    await chooseFromMenu(page, "Client A Inc.", "Delete");
    const dialog = page.getByRole("dialog", {
      name: "Can't delete Client A Inc.",
    });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  const PEOPLE = /^\d+ (person signs|people sign) in as this client\./;

  test("tells the owner where to remove them", async ({ page }) => {
    const dialog = await openBlocked(page, "owner@clientdesk.test");

    await expect(dialog.getByText(PEOPLE)).toContainText(
      "Remove them in Settings > Members first.",
    );
    await expect(
      dialog.getByRole("link", { name: "Open Members" }),
    ).toHaveAttribute("href", /\/settings\/members$/);
    await expect(
      dialog.getByRole("link", { name: "Open Projects" }),
    ).toBeVisible();
  });

  test("tells a member to ask an owner, without a link", async ({ page }) => {
    const dialog = await openBlocked(page, "member@clientdesk.test");

    await expect(dialog.getByText(PEOPLE)).toContainText(
      "Only a workspace owner can remove them in Settings > Members.",
    );
    await expect(
      dialog.getByRole("link", { name: "Open Members" }),
    ).toHaveCount(0);
  });
});

test("a client-role user has no actions on the Clients page", async ({
  page,
}) => {
  await login(page, "client-a@clientdesk.test");
  // The sidebar has no Clients link for this role, so the page is opened by
  // the seeded workspace's known slug.
  await page.goto("/w/acme-agency/clients");

  // The page itself loaded and shows the client's own row, so zero buttons is
  // not a 404 passing vacuously.
  await expect(page).toHaveURL(/\/w\/acme-agency\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Client A Inc.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(
    0,
  );
});
