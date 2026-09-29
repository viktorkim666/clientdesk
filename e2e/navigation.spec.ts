import { test, expect } from "@playwright/test";
import { login } from "./support/auth";

// Seeded in supabase/seed.sql: the Acme Agency workspace with a fixed owner
// and a client user scoped to Client A Inc. See e2e/accessibility.spec.ts
// for the same pattern with a different seeded user.
const OWNER_EMAIL = "owner@clientdesk.test";
const CLIENT_EMAIL = "client-a@clientdesk.test";

test.describe("navigation", () => {
  test("aria-current marks the open section for the owner", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("link", { name: "Clients" }),
    ).not.toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Projects" }),
    ).not.toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("a client sees only Dashboard and Projects", async ({ page }) => {
    await login(page, CLIENT_EMAIL);

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  });

  test("the sidebar footer's account menu is reachable on desktop", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    const accountTrigger = page.getByRole("button", { name: "Account" });
    await expect(accountTrigger).toBeVisible();

    await accountTrigger.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Light" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "Dark" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "System" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Sign out" }),
    ).toBeVisible();
  });

  test("the sidebar header links to the workspace dashboard and the account menu shows the signed-in user's email", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    const brandLink = page.getByRole("link", { name: "Workspace home" });
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute("href", /^\/w\/[a-z0-9-]+$/);

    await expect(page.getByText(OWNER_EMAIL).first()).toBeVisible();

    await page.getByRole("button", { name: "Account" }).click();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu.getByText(OWNER_EMAIL)).toBeVisible();
  });

  test("the Account menu can switch to dark mode and sign out", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    await page.getByRole("button", { name: "Account" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Picking a radio item keeps the menu open (see e2e/theme.spec.ts), so
    // Sign out can be clicked right away without reopening the trigger.
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the skip link is the first focusable element and moves focus to main content", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    // Queried from the SidebarProvider wrapper rather than the whole
    // document: under `next dev`, Next injects its own dev-tools indicator
    // (<nextjs-portal>) outside this wrapper, and that element isn't part
    // of the app or present in a production build.
    const wrapper = page.locator('[data-slot="sidebar-wrapper"]');
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstFocusable = wrapper.locator(focusableSelector).first();
    await expect(firstFocusable).toHaveAttribute("href", "#main-content");
    await expect(firstFocusable).toHaveText("Skip to main content");

    // The link is visually hidden (sr-only) until it receives focus, then
    // becomes visible via `focus:not-sr-only`. Compare its rendered size
    // before and after focusing it, since a hidden sr-only element still
    // has a non-empty 1px bounding box.
    const hiddenBox = await firstFocusable.boundingBox();
    expect(hiddenBox?.width).toBeLessThanOrEqual(1);

    await firstFocusable.focus();
    const visibleBox = await firstFocusable.boundingBox();
    expect(visibleBox?.width).toBeGreaterThan(1);
    await expect(firstFocusable).toBeVisible();

    await page.keyboard.press("Enter");
    const main = page.locator("#main-content");
    await expect(main).toBeFocused();
  });

  test("nav links live inside the Primary navigation landmark", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
  });

  test("Cmd/Ctrl+B does not toggle the sidebar while focus is in a text input", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    // Queried by data-slot rather than role: once the New client dialog
    // below is open, Base UI marks the rest of the page aria-hidden (the
    // expected way a modal dialog isolates itself), so a role query for the
    // sidebar wouldn't find it even though it is still there and unchanged.
    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    await page.getByRole("link", { name: "Clients" }).click();
    await page.getByRole("button", { name: "New client" }).click();
    const clientNameInput = page.getByLabel("Client name");
    await clientNameInput.click();

    await page.keyboard.press("ControlOrMeta+b");

    // The sidebar (and the dialog, and focus) are all unaffected: this is a
    // text-editing shortcut in this context, not a layout toggle.
    await expect(clientNameInput).toBeFocused();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  test.describe("at a phone viewport", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the nav opens as a sheet and closes after navigating", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);

      await expect(
        page.getByRole("link", { name: "Projects" }),
      ).not.toBeVisible();
      const openNav = page.getByRole("button", { name: "Open navigation" });
      await expect(openNav).toBeVisible();

      await openNav.click();
      const projectsLink = page.getByRole("link", { name: "Projects" });
      await expect(projectsLink).toBeVisible();

      await projectsLink.click();
      await expect(page).toHaveURL(/\/projects$/);
      await expect(projectsLink).not.toBeVisible();
    });

    test("Open navigation reports its expanded and popup state", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);

      const openNav = page.getByRole("button", { name: "Open navigation" });
      await expect(openNav).toHaveAttribute("aria-expanded", "false");
      await expect(openNav).toHaveAttribute("aria-haspopup", "dialog");

      await openNav.click();

      // Queried by data-slot rather than role: once the sheet is open, Base
      // UI marks the rest of the page (including this trigger, outside the
      // sheet) aria-hidden, so a role query would no longer find it even
      // though its aria-expanded value did update.
      const openNavAfterOpen = page.locator('[data-sidebar="trigger"]');
      await expect(openNavAfterOpen).toHaveAttribute("aria-expanded", "true");
    });

    // Reproduces where focus lands after navigating from the mobile sheet.
    // Observed: Base UI's dialog restores focus to its trigger (the "Open
    // navigation" button) once the sheet closes on navigation, so it never
    // falls back to <body> or a detached node. That's a sensible landing
    // spot, so no extra focus handling was added for this.
    test("focus lands on the nav trigger after navigating from the sheet", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);

      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("link", { name: "Projects" }).click();
      await expect(page).toHaveURL(/\/projects$/);

      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toBeFocused();
    });
  });

  test.describe("shell layout at 1280x800", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("the page container is padded and width-constrained on the Clients page", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);
      await page.getByRole("link", { name: "Clients" }).click();

      const newClientButton = page.getByRole("button", { name: "New client" });
      const buttonBox = await newClientButton.boundingBox();
      expect(buttonBox, "New client button has no bounding box").not.toBeNull();
      if (buttonBox) {
        const rightGap = 1280 - (buttonBox.x + buttonBox.width);
        expect(
          rightGap,
          `New client button right edge gap ${rightGap} < 24px`,
        ).toBeGreaterThanOrEqual(24);
      }

      const container = page.locator('[data-slot="page-container"]');
      const containerBox = await container.boundingBox();
      expect(containerBox, "page container has no bounding box").not.toBeNull();
      if (containerBox) {
        expect(
          containerBox.width,
          `page container width ${containerBox.width} > 1152 + padding`,
        ).toBeLessThanOrEqual(1152 + 64);
      }
    });

    test("the active nav link is inset from the sidebar edges like the header and footer", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);

      const sidebar = page.locator('[data-slot="sidebar-container"]');
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox, "sidebar has no bounding box").not.toBeNull();

      const activeLink = page.getByRole("link", { name: "Dashboard" });
      const linkBox = await activeLink.boundingBox();
      expect(linkBox, "active nav link has no bounding box").not.toBeNull();

      if (sidebarBox && linkBox) {
        const leftInset = linkBox.x - sidebarBox.x;
        expect(
          leftInset,
          `active nav link left inset ${leftInset} < 8px`,
        ).toBeGreaterThanOrEqual(8);

        const rightInset =
          sidebarBox.x + sidebarBox.width - (linkBox.x + linkBox.width);
        expect(
          rightInset,
          `active nav link right inset ${rightInset} < 8px`,
        ).toBeGreaterThanOrEqual(8);
      }
    });
  });
});
