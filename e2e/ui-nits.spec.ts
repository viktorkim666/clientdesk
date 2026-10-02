import { test, expect, type Page } from "@playwright/test";
import {
  buildFilledWorkspace,
  REPLY_BUTTON_NAME,
  REPLY_TEXTAREA_LABEL,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

test.describe("collapsed reply", () => {
  test("Reply expands the form, Escape keeps the draft, Cancel drops it, posting collapses and announces", async ({
    page,
  }) => {
    await buildFilledWorkspace(page, "reply", test.info().workerIndex);
    const reply = page.getByRole("button", { name: REPLY_BUTTON_NAME });
    const textarea = page.getByLabel(REPLY_TEXTAREA_LABEL);
    const status = page.getByRole("status").filter({ hasText: /posted/ });

    // The accessible name starts with the visible text, so voice control
    // users can say "click Reply", and it names the update's author.
    await expect(reply).toHaveText("Reply");
    await expect(reply).toHaveAccessibleName(/^Reply to .+'s update$/);

    // fillProjectPage posted through the form, so it is collapsed again, the
    // new comment is visible and the post was announced.
    await expect(reply).toHaveAttribute("aria-expanded", "false");
    await expect(textarea).toBeHidden();
    await expect(page.getByText("Looks good to me.")).toBeVisible();
    await expect(status).toHaveText("Comment posted");

    // Expanding moves focus into the textarea.
    await reply.click();
    await expect(reply).toHaveAttribute("aria-expanded", "true");
    await expect(textarea).toBeFocused();
    const controls = await reply.getAttribute("aria-controls");
    expect(controls).not.toBeNull();
    await expect(page.locator(`#${controls}`)).toBeVisible();

    // Escape collapses, returns focus to Reply and keeps the draft.
    await textarea.fill("Half a thought");
    await page.keyboard.press("Escape");
    await expect(textarea).toBeHidden();
    await expect(reply).toHaveAttribute("aria-expanded", "false");
    await expect(reply).toBeFocused();
    await reply.click();
    await expect(textarea).toHaveValue("Half a thought");

    // Cancel collapses the same way but drops the draft.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(textarea).toBeHidden();
    await expect(reply).toBeFocused();
    await reply.click();
    await expect(textarea).toHaveValue("");

    // A second comment collapses the form again, shows up and is announced.
    await textarea.fill("Second thought");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("Second thought")).toBeVisible();
    await expect(textarea).toBeHidden();
    await expect(reply).toHaveAttribute("aria-expanded", "false");
    await expect(reply).toBeFocused();
    await expect(status).toHaveText("Comment posted");
  });

  test("a failed post links its error to the textarea and the error is gone after the form is closed and reopened", async ({
    page,
  }) => {
    await buildFilledWorkspace(page, "reply-error", test.info().workerIndex);
    const reply = page.getByRole("button", { name: REPLY_BUTTON_NAME });
    const textarea = page.getByLabel(REPLY_TEXTAREA_LABEL);

    // Whitespace passes the browser's required check and fails validation on
    // the server.
    await reply.click();
    await textarea.fill("   ");
    await page.getByRole("button", { name: "Comment", exact: true }).click();

    const alert = page
      .getByRole("alert")
      .filter({ hasText: "Comment body is required" });
    await expect(alert).toBeVisible();
    await expect(textarea).toHaveAttribute("aria-invalid", "true");
    const alertId = await alert.getAttribute("id");
    expect(alertId).not.toBeNull();
    await expect(textarea).toHaveAttribute("aria-describedby", alertId ?? "");
    await expect(textarea).toHaveAccessibleDescription(
      (await alert.textContent()) ?? "",
    );

    // Closing and reopening does not show the old error again.
    await page.keyboard.press("Escape");
    await expect(textarea).toBeHidden();
    await reply.click();
    await expect(textarea).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(textarea).not.toHaveAttribute("aria-invalid", "true");
    await expect(textarea).not.toHaveAttribute("aria-describedby");
  });
});

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

type FocusWindow = Window & { focusedOutsideMenu?: string[] };

// Records every element outside the open dialog that takes focus, other than
// Base UI's invisible focus guards, which park focus for a moment at either
// end of the dialog before it wraps back in.
async function watchFocusOutsideMenu(page: Page) {
  await page.evaluate(() => {
    const target: FocusWindow = window;
    target.focusedOutsideMenu = [];
    document.addEventListener(
      "focusin",
      (event) => {
        const element = event.target;
        if (!(element instanceof HTMLElement)) return;
        if (element.hasAttribute("data-base-ui-focus-guard")) return;
        if (element.closest('[role="dialog"]')) return;
        // Menus opened from inside the dialog render in their own portal.
        if (element.closest('[role="menu"]')) return;
        target.focusedOutsideMenu?.push(
          element.getAttribute("aria-label") ?? element.tagName,
        );
      },
      true,
    );
  });
}

async function focusedOutsideMenu(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const target: FocusWindow = window;
    return target.focusedOutsideMenu ?? [];
  });
}

// The name of the focused element once focus has settled inside the dialog.
async function settledFocusName(page: Page, step: string): Promise<string> {
  const menu = page.getByRole("dialog");
  await expect
    .poll(
      () =>
        menu.evaluate((element) => element.contains(document.activeElement)),
      { message: `focus left the menu ${step}` },
    )
    .toBe(true);
  return page.evaluate(() => {
    const element = document.activeElement;
    return (
      element?.getAttribute("aria-label") ?? element?.textContent?.trim() ?? ""
    );
  });
}

test.describe("landing mobile menu", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("opens a panel with the links, traps focus, closes on Escape", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Menu", exact: true });
    await expect(button).toHaveAttribute("aria-expanded", "false");

    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

    await button.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    // The name stays "Menu" and the state comes from aria-expanded.
    // The page behind an open dialog is hidden from the role tree.
    const openButton = page.getByRole("button", {
      name: "Menu",
      exact: true,
      includeHidden: true,
    });
    await expect(openButton).toHaveAttribute("aria-expanded", "true");
    await expect(openButton).toHaveAttribute("aria-controls", /.+/);
    expect(await openButton.getAttribute("aria-controls")).toBe(
      await menu.getAttribute("id"),
    );
    const sections = menu.getByRole("navigation", { name: "Page sections" });
    await expect(
      sections.getByRole("link", { name: "Features" }),
    ).toBeVisible();
    await expect(
      sections.getByRole("link", { name: "How it works" }),
    ).toBeVisible();
    await expect(menu.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Theme" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("Tab cycles through every control in the panel and never reaches the page behind it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await watchFocusOutsideMenu(page);

    // Base UI parks focus on an invisible guard at either end for a moment
    // and then wraps it back into the panel, so each press is allowed to
    // settle before the focused control is read.
    const reached = new Set<string>();
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press("Tab");
      reached.add(
        await settledFocusName(page, `after ${step + 1} Tab presses`),
      );
    }
    for (const name of [
      "Close menu",
      "Features",
      "How it works",
      "Log in",
      "Sign up",
      "Theme",
    ]) {
      expect(reached, `Tab never reached "${name}"`).toContain(name);
    }
    expect(await focusedOutsideMenu(page)).toEqual([]);

    // Shift+Tab from the first control wraps to the last one.
    await menu.getByRole("button", { name: "Close menu" }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await settledFocusName(page, "after Shift+Tab")).toBe("Theme");
    expect(await focusedOutsideMenu(page)).toEqual([]);
  });

  test("the theme toggle inside the panel changes the theme and leaves the panel open", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = page.getByRole("dialog");

    await menu.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();

    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(menu).toBeVisible();
  });

  test("a section link closes the panel, scrolls to the section and focuses its heading", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    const targets = [
      { link: "Features", heading: "Everything a client relationship needs" },
      { link: "How it works", heading: "Up and running in three steps" },
    ];

    for (const { link, heading } of targets) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("dialog").getByRole("link", { name: link }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const target = page.getByRole("heading", { name: heading });
      await expect(target).toBeFocused();
      await expect(target).toBeInViewport();
      // The sticky header does not cover the heading.
      const headerBottom = (await header.boundingBox())?.height ?? 0;
      const headingTop = (await target.boundingBox())?.y ?? 0;
      expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
    }
    await expect(page).toHaveURL(/#how-it-works$/);
  });

  test("the close button inside the panel closes it and returns focus", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Menu", exact: true });
    await button.click();
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("the panel closes when the window grows past the md breakpoint", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Features" }),
    ).toBeVisible();
  });
});

test.describe("landing header between sm and md", () => {
  test.use({ viewport: { width: 700, height: 800 } });

  test("the section links are reachable through the menu and nothing overflows", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");

    await expect(header.getByRole("link", { name: "Features" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Log in" })).toBeHidden();
    await expect(header.getByRole("button", { name: "Theme" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Sign up" })).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);

    await header.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Features" })).toBeVisible();
    await menu.getByRole("link", { name: "How it works" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Up and running in three steps" }),
    ).toBeFocused();
  });
});

test.describe("landing header at the md breakpoint", () => {
  test.use({ viewport: { width: 768, height: 800 } });

  test("shows the inline links and no menu button without overflowing", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");

    await expect(
      header
        .getByRole("navigation", { name: "Page sections" })
        .getByRole("link", { name: "Features" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Menu", exact: true }),
    ).toBeHidden();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("landing header on desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("has no menu button and keeps the inline links and theme toggle", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(
      header.getByRole("button", { name: "Menu", exact: true }),
    ).toBeHidden();
    await expect(header.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Theme" })).toBeVisible();
  });
});

test.describe("single workspace", () => {
  test("shows the workspace name without a switcher", async ({ page }) => {
    await signUpOwnerWithEmptyWorkspace(
      page,
      "single-ws",
      test.info().workerIndex,
    );
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar.getByText("Empty Workspace")).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /Empty Workspace/ }),
    ).toHaveCount(0);
  });
});

test.describe("account menu", () => {
  test("the Sign out item is as wide as the theme items", async ({ page }) => {
    await signUpOwnerWithEmptyWorkspace(
      page,
      "signout-width",
      test.info().workerIndex,
    );
    await page.getByRole("button", { name: "Account" }).click();

    const light = page.getByRole("menuitemradio", { name: "Light" });
    const signOut = page.getByRole("menuitem", { name: "Sign out" });

    // The menu zooms in when it opens, so the two widths are read together
    // until the animation settles.
    await expect
      .poll(async () => {
        const lightBox = await light.boundingBox();
        const signOutBox = await signOut.boundingBox();
        if (!lightBox || !signOutBox) return Number.POSITIVE_INFINITY;
        return Math.abs(signOutBox.width - lightBox.width);
      })
      .toBeLessThanOrEqual(1);
  });
});
