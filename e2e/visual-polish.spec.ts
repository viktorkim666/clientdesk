import { test, expect, type Page } from "@playwright/test";
import { login } from "./support/auth";

test.describe("logo mark", () => {
  test("the cards are white in dark mode, like icon.svg", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const fills = await page
      .getByRole("link", { name: "Clientdesk home", exact: true })
      .locator("svg rect")
      .evaluateAll((rects) => rects.map((rect) => getComputedStyle(rect).fill));
    // Tile first, then the back and front cards.
    expect(fills).toHaveLength(3);
    expect(fills[1]).toBe("rgb(255, 255, 255)");
    expect(fills[2]).toBe("rgb(255, 255, 255)");
    expect(fills[0]).not.toBe("rgb(255, 255, 255)");
  });
});

const OWNER_EMAIL = "maya@northwind.test";
const MIN_TARGET = 44;

// Every visible native control plus the links that look like buttons or sit
// alone as a primary target. Visually hidden inputs (1px file inputs) are
// skipped: they are not something a finger can hit.
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const selector =
      'button, input:not([type="hidden"]), [role="combobox"], a[class*="group/button"], a[href="/login"], a[href="/signup"], a[aria-label$="home"], a[href^="https://github.com"], a[href$="/projects"]';
    return Array.from(document.querySelectorAll(selector))
      .map((element) => ({
        element,
        box: element.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width > 1 && box.height > 1)
      .filter(({ box }) => box.height < min)
      .map(({ element, box }) => {
        const label =
          element.getAttribute("aria-label") ??
          element.textContent?.trim().slice(0, 30) ??
          "";
        return `${element.tagName.toLowerCase()} "${label}" ${Math.round(box.height)}px`;
      });
  }, MIN_TARGET);
}

async function openFirstProject(page: Page) {
  await page.goto("/w/northwind/projects");
  await page
    .getByRole("link", { name: "Website redesign", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Website redesign", exact: true }),
  ).toBeVisible();
}

test.describe("tap targets on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("login controls are at least 44px tall", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });

  test("landing, signup and not-found targets are at least 44px tall", async ({
    page,
  }) => {
    for (const path of ["/", "/signup", "/no-such-page"]) {
      await page.goto(path);
      await expect(page.getByRole("link").first()).toBeAttached();
      expect(await smallTargets(page), path).toEqual([]);
    }
  });

  test("dashboard, project and members controls are at least 44px tall", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await smallTargets(page), "dashboard").toEqual([]);

    await openFirstProject(page);
    expect(await smallTargets(page), "project").toEqual([]);

    await page.goto("/w/northwind/settings/members");
    await expect(page.getByRole("table").first()).toBeVisible();
    expect(await smallTargets(page), "members").toEqual([]);
  });
});

test.describe("select options on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("are as tall as the trigger they open from", async ({ page }) => {
    await login(page, OWNER_EMAIL);
    await openFirstProject(page);

    await page
      .getByRole("combobox", { name: "Project status", exact: true })
      .click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    const heights = await options.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThan(1);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });
});

test.describe("dialog close button on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("sits inside the dialog corner without covering the title", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);
    await page.goto("/w/northwind/projects");
    await page
      .getByRole("button", { name: "New project", exact: true })
      .first()
      .click();

    const dialog = page.getByRole("dialog", {
      name: "New project",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    const title = dialog.locator('[data-slot="dialog-title"]');

    // The dialog zooms in; measure it at its final size.
    await dialog.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
    const [closeBox, titleBox, dialogBox] = await Promise.all([
      close.boundingBox(),
      title.boundingBox(),
      dialog.boundingBox(),
    ]);
    expect(closeBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(dialogBox).not.toBeNull();
    if (closeBox && titleBox && dialogBox) {
      expect(closeBox.height).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(closeBox.x, "close is inside the dialog").toBeGreaterThanOrEqual(
        dialogBox.x,
      );
      expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width,
      );
      expect(closeBox.y).toBeGreaterThanOrEqual(dialogBox.y);
      expect(
        titleBox.x + titleBox.width,
        "title ends before the close button starts",
      ).toBeLessThanOrEqual(closeBox.x);
    }
  });
});

// Desktop keeps the compact shadcn sizes on purpose: only phones get the 44px
// touch targets. `h-8` is the default Button/Input/Select height, `h-7` the
// `sm` Button height (see src/components/ui/button.tsx).
const DESKTOP_HEIGHTS = { defaultControl: 32, smallButton: 28 };

test.describe("control sizes on desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("default controls keep their compact height", async ({ page }) => {
    await page.goto("/login");
    const heights = await page
      .locator("form")
      .locator('input:not([type="hidden"]), button')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      );
    expect(heights).toEqual([
      DESKTOP_HEIGHTS.defaultControl,
      DESKTOP_HEIGHTS.defaultControl,
      DESKTOP_HEIGHTS.defaultControl,
    ]);

    await login(page, OWNER_EMAIL);
    await openFirstProject(page);
    const post = await page
      .getByRole("button", { name: "Post update", exact: true })
      .boundingBox();
    expect(post?.height).toBe(DESKTOP_HEIGHTS.smallButton);
    const status = await page
      .getByRole("combobox", { name: "Project status", exact: true })
      .boundingBox();
    expect(status?.height).toBe(DESKTOP_HEIGHTS.defaultControl);
  });
});

test.describe("project files", () => {
  test("on a phone each file has its own name line, an unbroken meta line and actions below", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, OWNER_EMAIL);
    await openFirstProject(page);

    const rows = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: /^Download / }) });
    await expect(rows.nth(1)).toBeVisible();

    for (const row of await rows.all()) {
      const name = row.locator('[data-slot="file-name"]');
      const fileName = (await name.getAttribute("title")) ?? "";
      const nameBox = await name.boundingBox();
      // The whole name is readable: it wraps instead of being cut off.
      const clipped = await name.evaluate((element) => ({
        textOverflow: getComputedStyle(element).textOverflow,
        overflows: element.scrollWidth > element.clientWidth,
      }));
      expect(clipped.textOverflow, `${fileName} is ellipsized`).not.toBe(
        "ellipsis",
      );
      expect(clipped.overflows, `${fileName} is clipped`).toBe(false);
      await expect(name).toHaveText(fileName);

      const chunks = row.locator('[data-slot="file-meta-chunk"]');
      await expect(chunks, `${fileName} meta chunks`).toHaveCount(2);
      for (const chunk of await chunks.all()) {
        const box = await chunk.boundingBox();
        expect(box?.height, `${await chunk.innerText()} splits`).toBeLessThan(
          20,
        );
      }

      const download = await row
        .getByRole("button", { name: /^Download / })
        .boundingBox();
      expect(download).not.toBeNull();
      expect(nameBox).not.toBeNull();
      if (download && nameBox) {
        expect(download.y, `${fileName} actions sit below`).toBeGreaterThan(
          nameBox.y + nameBox.height,
        );
        expect(download.x + download.width).toBeLessThanOrEqual(375);
        // The buttons line up under the name text, not under the icon.
        expect(
          Math.abs(download.x - nameBox.x),
          `${fileName} actions align with the name`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("Download and Delete look like buttons on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, OWNER_EMAIL);
    await openFirstProject(page);

    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name: /^Download / }) })
      .first();
    const download = row.getByRole("button", { name: /^Download / });
    const remove = row.getByRole("button", { name: /^Delete / });
    const style = (locator: typeof download) =>
      locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          border: computed.borderTopWidth,
          radius: computed.borderTopLeftRadius,
          background: computed.backgroundColor,
          color: computed.color,
        };
      });
    const [downloadStyle, removeStyle] = [
      await style(download),
      await style(remove),
    ];
    expect(downloadStyle.border).toBe("1px");
    expect(downloadStyle.radius).not.toBe("0px");
    expect(removeStyle.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(removeStyle.color).not.toBe(downloadStyle.color);
  });
});

for (const width of [1440, 375]) {
  test.describe(`members rows at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("the name lines up with its avatar and Remove is a labelled destructive button", async ({
      page,
    }) => {
      await login(page, OWNER_EMAIL);
      await page.goto("/w/northwind/settings/members");
      const row = page.getByRole("row", { name: /^Priya Nair/ });
      await expect(row).toBeVisible();

      const avatar = await row.locator('[data-slot="avatar"]').boundingBox();
      const name = await row
        .getByText("Priya Nair", { exact: true })
        .boundingBox();
      expect(avatar).not.toBeNull();
      expect(name).not.toBeNull();
      if (avatar && name) {
        const gap = Math.abs(
          avatar.y + avatar.height / 2 - (name.y + name.height / 2),
        );
        // At 375px the client name sits under the name, so the avatar
        // centers on the pair and the name is one line above the middle.
        expect(gap, "name vs avatar center").toBeLessThanOrEqual(
          width === 375 ? 12 : 2,
        );
      }

      const remove = row.getByRole("button", {
        name: "Remove Priya Nair",
        exact: true,
      });
      await expect(remove).toBeVisible();
      await expect(remove).toHaveText("Remove");
      const box = await remove.boundingBox();
      if (width === 375) {
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      const background = await remove.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
    });
  });
}

const BACKDROP_PAGES = [
  { path: "/login", name: "login" },
  { path: "/signup", name: "signup" },
  { path: "/invite/sample-token", name: "invite" },
  { path: "/no-such-page", name: "not-found" },
];

test.describe("auth and 404 backdrop", () => {
  for (const { path, name } of BACKDROP_PAGES) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${name} has a decorative glow and grid in ${scheme} mode`, async ({
        page,
      }) => {
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.goto(path);

        const backdrop = page.locator(
          '[aria-hidden="true"]:has(> .landing-glow)',
        );
        await expect(backdrop).toHaveCount(1);
        const paint = await backdrop.evaluate((element) => {
          const glow = element.querySelector(".landing-glow");
          const grid = element.querySelector(".landing-grid");
          if (!glow || !grid) {
            throw new Error("glow or grid is missing");
          }
          return {
            glow: getComputedStyle(glow).backgroundImage,
            grid: getComputedStyle(grid).backgroundImage,
            animation: getComputedStyle(glow).animationName,
            position: getComputedStyle(element).position,
            interactive: element.querySelector("a, button, input"),
          };
        });
        expect(paint.glow).toContain("radial-gradient");
        expect(paint.grid).toContain("linear-gradient");
        expect(paint.animation).toBe("none");
        expect(paint.position).toBe("absolute");
        expect(paint.interactive).toBeNull();

        // The backdrop takes no space: no scrollbars on either axis.
        const overflow = await page.evaluate(() => ({
          x: document.documentElement.scrollWidth - innerWidth,
          y: document.documentElement.scrollHeight - innerHeight,
        }));
        expect(overflow.x).toBeLessThanOrEqual(0);
        expect(overflow.y).toBeLessThanOrEqual(0);
      });
    }
  }

  test("not-found shows the brand mark and the theme toggle", async ({
    page,
  }) => {
    await page.goto("/no-such-page");

    await expect(
      page.getByRole("link", { name: "Clientdesk home", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Theme", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Page not found", exact: true }),
    ).toBeVisible();
  });

  test("not-found has its own document title", async ({ page }) => {
    await page.goto("/no-such-page");

    await expect(page).toHaveTitle("Page not found · Clientdesk");
  });
});

test.describe("sidebar footer", () => {
  test("shows the full name with the email muted below it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, OWNER_EMAIL);

    const account = page.getByRole("button", { name: "Account" });
    const name = account.getByText("Maya Chen", { exact: true });
    const email = account.getByText(OWNER_EMAIL, { exact: true });
    await expect(name).toBeVisible();
    await expect(email).toBeVisible();
    await expect(account.locator('[data-slot="avatar"]')).toHaveText("MC");

    const nameBox = await name.boundingBox();
    const emailBox = await email.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(emailBox).not.toBeNull();
    if (nameBox && emailBox) {
      expect(emailBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    }
    const sizes = await Promise.all([
      name.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
      email.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ]);
    expect(sizes[1]).toBeLessThan(sizes[0]);
  });
});

test.describe("account menu", () => {
  test("the trigger's accessible name contains its visible text (WCAG 2.5.3)", async ({
    page,
  }) => {
    await login(page, OWNER_EMAIL);

    const account = page.getByRole("button", { name: "Account" });
    await expect(account).toHaveAccessibleName(
      /^Account:\s*Maya Chen\s*maya@northwind\.test$/,
    );
  });

  test("the email in the menu wraps instead of being cut off", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, OWNER_EMAIL);
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page.getByRole("button", { name: "Account" }).click();

    const label = page.locator('[data-slot="dropdown-menu-label"]');
    await expect(label).toHaveText(OWNER_EMAIL);
    const style = await label.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        textOverflow: computed.textOverflow,
        overflowWrap: computed.overflowWrap,
        clipped: element.scrollWidth > element.clientWidth,
      };
    });
    expect(style.textOverflow).not.toBe("ellipsis");
    expect(style.overflowWrap).toBe("anywhere");
    expect(style.clipped).toBe(false);
    await expect(label).toHaveAttribute("title", OWNER_EMAIL);
  });
});

test.describe("dashboard metrics", () => {
  function metricTitles(page: Page) {
    return page
      .locator('[data-slot="card"]')
      .filter({ has: page.locator('[data-slot="card-title"]') })
      .locator('[data-slot="card-title"]');
  }

  test("read as one line each on a phone, with the full labels still available", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, OWNER_EMAIL);

    const titles = metricTitles(page);
    await expect(titles).toHaveCount(3);
    const heights = await titles.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
    expect(new Set(heights).size, `heights ${heights.join(", ")}`).toBe(1);

    const full = await titles.evaluateAll((elements) =>
      elements.map((element) => element.textContent),
    );
    expect(full.join("|")).toContain("Active projects");
    expect(full.join("|")).toContain("Updates this week");
    // The tail of each long label is visually hidden, not removed.
    const tail = titles.getByText("projects", { exact: true });
    await expect(tail).toBeAttached();
    expect((await tail.boundingBox())?.width).toBeLessThanOrEqual(1);
  });

  test("show the full labels on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, OWNER_EMAIL);

    await expect(
      page.getByRole("main").getByText("Active projects", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Updates this week", { exact: true }),
    ).toBeVisible();
    await expect(
      metricTitles(page).getByText("projects", { exact: true }),
    ).toBeVisible();
  });
});
