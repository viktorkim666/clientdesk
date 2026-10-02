import { test, expect, type Locator, type Page } from "@playwright/test";
import { login } from "./support/auth";
import {
  buildFilledWorkspace,
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
const PRO_OWNER_EMAIL = "ai-draft-owner@clientdesk.test";
// The seeded Free workspace's client user, already a member of Client A Inc.
// with a project (Client A Website Redesign) - see supabase/seed.sql.
const SEEDED_CLIENT_EMAIL = "client-a@clientdesk.test";
// The seeded Free workspace's owner (acme-agency): an owner, a member and two
// client users, so the members table has every kind of row.
const SEEDED_OWNER_EMAIL = "owner@clientdesk.test";
const SEEDED_MEMBER_NAMES = [
  "Olivia Owner",
  "Mason Member",
  "Carla Client A",
  "Blake Client B",
];

async function expectNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth);

  // A table that scrolls inside its own container is still a broken
  // layout at this width, even though the page itself does not scroll.
  const scrollingTables = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="table-container"]'))
      .filter((element) => element.scrollWidth > element.clientWidth)
      .map((element) => element.scrollWidth + ">" + element.clientWidth),
  );
  expect(scrollingTables, `${label}: a table scrolls horizontally`).toEqual([]);
}

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function expectDialogFitsViewport(page: Page, label: string) {
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    expect(box, `${label}: dialog has no bounding box`).not.toBeNull();
    if (box) {
      expect(
        box.x + box.width,
        `${label}: dialog right edge ${box.x + box.width} exceeds viewport width 375`,
      ).toBeLessThanOrEqual(375);
    }
  }

  async function expectAlertDialogFitsViewport(page: Page, label: string) {
    const box = await page.getByRole("alertdialog").boundingBox();
    expect(box, `${label}: dialog has no bounding box`).not.toBeNull();
    if (box) {
      expect(
        box.x,
        `${label}: dialog starts left of the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${label}: dialog right edge ${box.x + box.width} exceeds viewport width 375`,
      ).toBeLessThanOrEqual(375);
    }
  }

  // Popups zoom in from 95%, which would shrink the measured sizes.
  async function expectSettled(page: Page) {
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
  }

  async function expectTarget44(
    target: Locator,
    label: string,
    { width = true }: { width?: boolean } = {},
  ) {
    await expect(target, `${label} is visible`).toBeVisible();
    const box = await target.boundingBox();
    expect(box, `${label}: no bounding box`).not.toBeNull();
    if (box) {
      expect(box.height, `${label} height`).toBeGreaterThanOrEqual(44);
      if (width) {
        expect(box.width, `${label} width`).toBeGreaterThanOrEqual(44);
      }
    }
  }

  async function expectInViewport(target: Locator, label: string) {
    const box = await target.boundingBox();
    expect(box, `${label}: no bounding box`).not.toBeNull();
    if (box) {
      expect(
        box.x,
        `${label}: starts left of the viewport`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        box.x + box.width,
        `${label}: right edge ${box.x + box.width} exceeds viewport width 375`,
      ).toBeLessThanOrEqual(375);
    }
  }

  async function loginAsProOwner(page: Page) {
    await login(page, PRO_OWNER_EMAIL);
  }

  // At 375px the sidebar collapses into a sheet, so a nav link is only
  // visible after opening it (see e2e/navigation.spec.ts).
  async function openNavAndClick(page: Page, linkName: string) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: linkName }).click();
  }

  async function loginAsSeededClient(page: Page) {
    await login(page, SEEDED_CLIENT_EMAIL);
  }

  test("public routes have no horizontal scroll at 375px", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "/");

    await page.goto("/login");
    await expectNoHorizontalScroll(page, "/login");

    await page.goto("/signup");
    await expectNoHorizontalScroll(page, "/signup");
  });

  test("owner routes and dialogs have no horizontal scroll at 375px", async ({
    page,
  }) => {
    await loginAsProOwner(page);
    await expectNoHorizontalScroll(page, "dashboard");
    const workspaceUrl = page.url();

    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const clientName = `Mobile Client ${suffix}`;
    const projectName = `Mobile Project ${suffix}`;

    await openNavAndClick(page, "Clients");
    await expectNoHorizontalScroll(page, "clients");

    await page.getByRole("button", { name: "New client" }).click();
    await expectDialogFitsViewport(page, "new client dialog");
    await page.getByLabel("Client name").fill(clientName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: clientName, exact: true }),
    ).toBeVisible();

    // The row menu and what it opens: 44px targets, dialogs inside the
    // viewport, and no sideways scroll.
    const rowActions = page.getByRole("button", {
      name: `Actions for ${clientName}`,
    });
    await expectTarget44(rowActions, "row actions button");
    await rowActions.click();
    await expectSettled(page);
    await expectNoHorizontalScroll(page, "client row menu");
    for (const item of ["Rename", "Delete"]) {
      await expectTarget44(
        page.getByRole("menuitem", { name: item }),
        `${item} menu item`,
        { width: false },
      );
    }
    await expectInViewport(
      page.getByRole("menu"),
      "client row menu inside the viewport",
    );
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expectSettled(page);
    await expectDialogFitsViewport(page, "rename client dialog");
    await expectNoHorizontalScroll(page, "rename client dialog");
    await page.keyboard.press("Escape");

    await rowActions.click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expectSettled(page);
    await expectAlertDialogFitsViewport(page, "delete client dialog");
    await expectNoHorizontalScroll(page, "delete client dialog");
    for (const name of ["Cancel", "Delete client"]) {
      await expectTarget44(
        page.getByRole("alertdialog").getByRole("button", { name }),
        `${name} button`,
        { width: false },
      );
    }
    await page.getByRole("button", { name: "Cancel" }).click();

    // A 100-character name with no break opportunity wraps in the row and in
    // the dialog title instead of widening the page.
    const longName = `Long${suffix}`.padEnd(100, "x");
    await page.getByRole("button", { name: "New client" }).click();
    await page.getByLabel("Client name").fill(longName);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const longActions = page.getByRole("button", {
      name: `Actions for ${longName}`,
    });
    await expect(longActions).toBeVisible();
    await expectNoHorizontalScroll(page, "clients with a long name");
    await expectInViewport(longActions, "long-name row actions button");
    await longActions.click();
    await expect(
      page.getByRole("menu").getByText(longName),
      "the menu does not repeat the name",
    ).toHaveCount(0);
    await expectInViewport(page.getByRole("menu"), "long-name row menu");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expectSettled(page);
    await expectAlertDialogFitsViewport(page, "delete dialog, long name");
    await expectNoHorizontalScroll(page, "delete dialog, long name");
    await page.getByRole("button", { name: "Cancel" }).click();

    await openNavAndClick(page, "Projects");
    await expectNoHorizontalScroll(page, "projects");

    await page.getByRole("button", { name: "New project" }).click();
    await expectDialogFitsViewport(page, "new project dialog");
    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: clientName }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("cell", { name: projectName })).toBeVisible();

    await page.getByRole("link", { name: projectName }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "project page");

    await page.goto(`${workspaceUrl}/settings/members`);
    await expectNoHorizontalScroll(page, "settings/members");

    await page.getByRole("button", { name: "Invite" }).click();
    await expectDialogFitsViewport(page, "invite member dialog");
    await page.keyboard.press("Escape");

    await page.goto(`${workspaceUrl}/settings/billing`);
    await expectNoHorizontalScroll(page, "settings/billing");
  });

  test("populated tables fit at 375px for the seeded owner", async ({
    page,
  }) => {
    await login(page, SEEDED_OWNER_EMAIL);
    const workspaceUrl = page.url();

    for (const path of ["clients", "projects", "settings/members"]) {
      await page.goto(`${workspaceUrl}/${path}`);
      await expect(page.getByRole("table").first()).toBeVisible();
      await expectNoHorizontalScroll(page, `populated ${path}`);
    }

    // Seeded Client A Inc. has a project and a person, so Delete explains.
    await page.goto(`${workspaceUrl}/clients`);
    const seededActions = page.getByRole("button", {
      name: "Actions for Client A Inc.",
    });
    await expectTarget44(seededActions, "seeded row actions button");
    await seededActions.click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expectSettled(page);
    await expectDialogFitsViewport(page, "blocked client dialog");
    await expectNoHorizontalScroll(page, "blocked client dialog");
    await expectTarget44(
      page.getByRole("dialog").getByRole("link", { name: "Open Projects" }),
      "Open Projects link",
      { width: false },
    );
    await expectTarget44(
      page.getByRole("dialog").getByRole("button", { name: "Close" }),
      "blocked dialog Close button",
      { width: false },
    );
    await page.getByRole("button", { name: "Close" }).click();

    await page.goto(`${workspaceUrl}/settings/members`);
    const main = page.getByRole("main");

    // Every seeded member's name stays on one line and is not cut off with an
    // ellipsis. Scoped to the seeded names, so rows other specs add to this
    // workspace do not change the count.
    for (const name of SEEDED_MEMBER_NAMES) {
      const nameCell = main
        .getByRole("row", { name: new RegExp(name) })
        .getByText(name, { exact: true });
      await expect(nameCell, `${name} is visible`).toBeVisible();
      const fit = await nameCell.evaluate((element) => ({
        clipped: element.scrollWidth > element.clientWidth,
        height: element.getBoundingClientRect().height,
        // Free width left beside the text. Font metrics differ per platform
        // (Linux CI renders wider than macOS), so a name that only just fits
        // here is truncated there.
        slack: (() => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return element.clientWidth - range.getBoundingClientRect().width;
        })(),
      }));
      expect(fit.clipped, `${name} is truncated`).toBe(false);
      expect(
        fit.slack,
        `${name} has no slack for wider fonts (slack ${fit.slack}px)`,
      ).toBeGreaterThanOrEqual(24); // Headroom for wider Linux font metrics in CI.
      expect(fit.height, `${name} wraps`).toBeLessThanOrEqual(24);
    }

    // Role controls and Remove stay visible, inside the viewport and at least
    // 44px in both directions.
    const controls = main.locator(
      'tbody button[role="combobox"], tbody button[aria-label^="Remove"]',
    );
    expect(await controls.count()).toBeGreaterThan(0);
    for (const control of await controls.all()) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }

    // Each member's client is still shown, either in its column or under
    // the name.
    await expect(
      main.locator("tbody").getByText("Client A Inc.").first(),
    ).toBeVisible();
  });

  test("empty workspace screens have no horizontal scroll at 375px", async ({
    page,
  }) => {
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "mobile-empty",
      test.info().workerIndex,
    );
    await expect(
      page.getByRole("main").getByText("No activity yet"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty dashboard");

    await page.goto(`${workspaceUrl}/projects`);
    await expect(
      page.getByRole("main").getByText("Add a client first"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty projects without clients");

    await page.goto(`${workspaceUrl}/clients`);
    await expect(
      page.getByRole("main").getByText("Add your first client"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty clients");

    await createClientViaDialog(page, workspaceUrl, "Mobile Empty Client");
    await page.goto(`${workspaceUrl}/projects`);
    await expect(
      page.getByRole("main").getByText("Start your first project"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty projects with a client");

    await page.goto(`${workspaceUrl}/settings/members`);
    await expect(
      page.getByRole("main").getByText("No pending invitations"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty members");

    await page.goto(`${workspaceUrl}/settings/billing`);
    await expectNoHorizontalScroll(page, "empty billing");

    await createProjectAndOpen(
      page,
      workspaceUrl,
      "Mobile Empty Project",
      "Mobile Empty Client",
    );
    await expect(
      page.getByRole("main").getByText("No updates yet"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "empty project page");
  });

  test("a filled project page and a populated dashboard have no horizontal scroll at 375px", async ({
    page,
  }) => {
    const { workspaceUrl } = await buildFilledWorkspace(
      page,
      "mobile-filled",
      test.info().workerIndex,
    );
    await expectNoHorizontalScroll(page, "filled project page");

    // The delete button is its own column: a 44px target on mobile that
    // never covers the comment text.
    const deleteComment = page.getByRole("button", {
      name: /^Delete comment by /,
    });
    const deleteBox = await deleteComment.boundingBox();
    const bodyBox = await page.getByText("Looks good to me.").boundingBox();
    expect(deleteBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    if (deleteBox && bodyBox) {
      expect(deleteBox.width).toBeGreaterThanOrEqual(44);
      expect(deleteBox.height).toBeGreaterThanOrEqual(44);
      const overlaps =
        deleteBox.x < bodyBox.x + bodyBox.width &&
        deleteBox.x + deleteBox.width > bodyBox.x &&
        deleteBox.y < bodyBox.y + bodyBox.height &&
        deleteBox.y + deleteBox.height > bodyBox.y;
      expect(overlaps, "the delete button covers the comment text").toBe(false);
    }

    // On mobile the file's uploader, size and date sit under its name.
    const fileRow = page.getByRole("row", { name: /sample\.pdf/ });
    await expect(
      fileRow.getByText(/Empty State Owner · 342 B · /),
    ).toBeVisible();

    // The upload zone is a visible label over the hidden native input.
    await expect(page.getByLabel("Upload a file")).toHaveCount(1);
    await expect(page.getByText("Upload a file")).toBeVisible();

    // The Delete project button and the buttons in its dialog are 44px
    // targets, and the dialog fits the viewport with its text typed in.
    const deleteProject = page.getByRole("button", { name: "Delete project" });
    expect((await deleteProject.boundingBox())?.height).toBeGreaterThanOrEqual(
      44,
    );
    await deleteProject.click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog).toBeVisible();
    // The dialog zooms in from 95%, which would shrink the measured sizes.
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
    await deleteDialog
      .getByLabel("Type the project name to confirm")
      .fill("Filled Project");
    for (const name of ["Cancel", "Delete project"]) {
      const box = await deleteDialog
        .getByRole("button", { name })
        .boundingBox();
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await expectAlertDialogFitsViewport(page, "delete project dialog");
    await expectNoHorizontalScroll(page, "delete project dialog");
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();

    // A long name with no break opportunity wraps instead of widening the
    // page, in the header, the dialog text and the helper line.
    const longName = `Wrapping-${"long-name-".repeat(10)}end`;
    await createProjectAndOpen(
      page,
      workspaceUrl,
      longName,
      "Filled Client Co.",
    );
    await expectNoHorizontalScroll(page, "project page with a long name");
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expectAlertDialogFitsViewport(page, "delete dialog, long name");
    await expectNoHorizontalScroll(page, "delete dialog, long name");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.goto(workspaceUrl);
    await expect(
      page.getByRole("region", { name: "Recent activity" }).getByRole("list"),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "populated dashboard");
  });

  test("client routes have no horizontal scroll at 375px", async ({ page }) => {
    await loginAsSeededClient(page);
    await expectNoHorizontalScroll(page, "client dashboard");

    await openNavAndClick(page, "Projects");
    await expect(page).toHaveURL(/\/projects$/);
    await expectNoHorizontalScroll(page, "client projects");

    await page.getByRole("link", { name: "Client A Website Redesign" }).click();
    await expect(
      page.getByRole("heading", { name: "Client A Website Redesign" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page, "client project page");
  });
});

async function expectFloatingUpdateInViewport(
  page: Page,
  width: number,
  label: string,
) {
  const box = await page.locator("[data-floating-update]").boundingBox();
  expect(box, `${label}: floating update has no bounding box`).not.toBeNull();
  if (box) {
    expect(
      box.x,
      `${label}: floating update starts left of the viewport`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `${label}: floating update ends right of the viewport`,
    ).toBeLessThanOrEqual(width);
  }
}

test.describe("narrow layout", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test("the landing page has no horizontal scroll at 320px", async ({
    page,
  }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "/");
  });
});

test.describe("tablet layout", () => {
  test.use({
    viewport: { width: 768, height: 1024 },
    reducedMotion: "reduce",
  });

  test("the landing page has no horizontal scroll at 768px", async ({
    page,
  }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "/");
    await expectFloatingUpdateInViewport(page, 768, "/ at 768px");
  });
});

test.describe("small desktop layout", () => {
  test.use({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce",
  });

  test("the landing page has no horizontal scroll at 1024px", async ({
    page,
  }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page, "/");
    await expectFloatingUpdateInViewport(page, 1024, "/ at 1024px");
  });
});
