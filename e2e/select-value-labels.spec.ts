import { test, expect } from "@playwright/test";

test.describe("select triggers show labels, not raw values", () => {
  test("the new-project dialog's client select shows the client's name", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `owner-${suffix}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Select Labels Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-select-labels-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill("Acme Client Co.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Acme Client Co.", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Projects" }).click();
    await page.getByRole("button", { name: "New project" }).click();

    // The dialog defaults to the workspace's first client, so the client
    // select shows a name (not a UUID) even before the user touches it.
    await expect(page.getByRole("combobox", { name: "Client" })).toContainText(
      "Acme Client Co.",
    );

    // Picking the client explicitly must also show its name, not its id.
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: "Acme Client Co." }).click();
    await expect(page.getByRole("combobox", { name: "Client" })).toContainText(
      "Acme Client Co.",
    );

    // The status select must show the formatted label too ("On hold"),
    // not the raw enum value ("on_hold").
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "On hold" }).click();
    await expect(page.getByRole("combobox", { name: "Status" })).toContainText(
      "On hold",
    );
  });

  test("the invite dialog's client select shows the client's name", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `owner-${suffix}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // A workspace name containing the word "Invite" would make the
    // workspace-switcher button, in the header, itself match
    // `getByRole("button", { name: "Invite" })` below (Playwright's default
    // role-name match is a substring match), so this picks a name that
    // avoids every label used elsewhere in the test.
    await page.getByLabel("Workspace name").fill("E2E Member Roster Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-member-roster-agency-[a-z0-9]+$/);

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill("Beta Client Co.");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Beta Client Co.", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page
      .getByLabel("Email")
      .fill(`invitee-${suffix}@e2e.clientdesk.test`);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Client", exact: true }).click();

    // Default client selection (the workspace's first client) must show
    // the client's name in the trigger, not its raw UUID.
    await expect(
      page.getByRole("combobox", { name: "Client", exact: true }),
    ).toContainText("Beta Client Co.");

    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: "Beta Client Co." }).click();
    await expect(
      page.getByRole("combobox", { name: "Client", exact: true }),
    ).toContainText("Beta Client Co.");
  });

  test("the invite dialog disables the client role when the workspace has no clients yet", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const ownerEmail = `owner-${suffix}@e2e.clientdesk.test`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E No Clients Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-no-clients-agency-[a-z0-9]+$/);

    // A fresh workspace has no clients yet, so the "client" role must be
    // disabled rather than letting the invite proceed into a client picker
    // with no options.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Role").click();
    const clientOption = page.getByRole("option", {
      name: "client (add a client first)",
    });
    await expect(clientOption).toBeVisible();
    await expect(clientOption).toHaveAttribute("data-disabled", "");
    // Playwright itself refuses to click a disabled option, which is
    // exactly the point: the role can't be picked, so the client picker
    // (which would have zero options) never appears.
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Client", { exact: true })).toHaveCount(0);
  });
});
