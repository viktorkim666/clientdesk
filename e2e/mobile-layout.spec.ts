import { test, expect, type Page } from "@playwright/test";
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
    await expect(page.getByRole("cell", { name: clientName })).toBeVisible();

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
