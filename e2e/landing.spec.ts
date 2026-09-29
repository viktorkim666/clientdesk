import { test, expect, type Locator, type Page } from "@playwright/test";
import { login } from "./support/auth";
import { backgroundBehind, contrastRatio } from "./support/contrast";

test.describe("links styled as buttons keep role=link", () => {
  test("the home page actions are links, not buttons", async ({ page }) => {
    await page.goto("/");

    const header = page.getByRole("banner");
    const main = page.getByRole("main");

    // The hero and the closing panel both carry a Log in link.
    await expect(header.getByRole("link", { name: "Log in" })).toHaveCount(1);
    await expect(main.getByRole("link", { name: "Log in" })).toHaveCount(2);
    await expect(header.getByRole("button", { name: "Log in" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Log in" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Sign up" })).toHaveCount(1);
    await expect(header.getByRole("button", { name: "Sign up" })).toHaveCount(
      0,
    );
    // One in the hero and one in the closing panel.
    await expect(main.getByRole("link", { name: "Start free" })).toHaveCount(2);
    await expect(main.getByRole("button", { name: "Start free" })).toHaveCount(
      0,
    );
  });

  test("the not-found page action is a link", async ({ page }) => {
    await page.goto("/no-such-page");

    await expect(page.getByRole("link", { name: "Back home" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Back home" })).toHaveCount(
      0,
    );
  });

  test("the invite page actions are links for a signed-out visitor", async ({
    page,
  }) => {
    await page.goto("/invite/sample-token");

    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Sign up" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign up" })).toHaveCount(0);
  });
});

// Every rule in every stylesheet, including those nested in @media/@supports.
async function stylesheetHasRule(
  page: Page,
  selector: string,
  declaration: string,
): Promise<boolean> {
  return page.evaluate(
    ([wantedSelector, wantedDeclaration]) => {
      const visit = (rules: CSSRuleList): boolean =>
        Array.from(rules).some((rule) => {
          if (
            rule instanceof CSSStyleRule &&
            rule.selectorText === wantedSelector &&
            rule.cssText.includes(wantedDeclaration)
          ) {
            return true;
          }
          return "cssRules" in rule && visit(rule.cssRules as CSSRuleList);
        });
      return Array.from(document.styleSheets).some((sheet) => {
        try {
          return visit(sheet.cssRules);
        } catch {
          return false;
        }
      });
    },
    [selector, declaration],
  );
}

test.describe("landing motion", () => {
  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("reveal blocks and the hero preview are static and fully visible", async ({
      page,
    }) => {
      await page.goto("/");

      // The rule must exist, or the static state below proves nothing.
      expect(
        await stylesheetHasRule(page, ".reveal", "animation-timeline"),
      ).toBe(true);

      const reveals = page.locator("main .reveal");
      await expect(reveals).toHaveCount(8);
      for (const block of await reveals.all()) {
        const style = await block.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            opacity: computed.opacity,
            animationName: computed.animationName,
          };
        });
        expect(style).toEqual({ opacity: "1", animationName: "none" });
      }

      const rise = await page.locator("main .hero-rise").evaluate((element) => {
        const computed = getComputedStyle(element);
        return {
          opacity: computed.opacity,
          animationName: computed.animationName,
        };
      });
      expect(rise).toEqual({ opacity: "1", animationName: "none" });
    });
  });

  test.describe("motion allowed", () => {
    test.use({ reducedMotion: "no-preference" });

    test.beforeEach(({ browserName }) => {
      test.skip(
        browserName !== "chromium",
        "scroll-driven animations are only asserted in Chromium",
      );
    });

    test("reveal blocks use a view timeline and the hero preview rises in", async ({
      page,
    }) => {
      await page.goto("/");

      const reveals = page.locator("main .reveal");
      await expect(reveals).toHaveCount(8);
      for (const block of await reveals.all()) {
        const style = await block.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            timeline: computed.getPropertyValue("animation-timeline"),
            animationName: computed.animationName,
          };
        });
        expect(style.timeline).not.toBe("auto");
        expect(style.animationName).not.toBe("none");
      }

      const riseName = await page
        .locator("main .hero-rise")
        .evaluate((element) => getComputedStyle(element).animationName);
      expect(riseName).not.toBe("none");
    });

    test.describe("at 375px", () => {
      test.use({ viewport: { width: 375, height: 800 } });

      test("jumping to #features leaves the heading fully opaque", async ({
        page,
      }) => {
        await page.goto("/#features");

        const heading = page
          .getByRole("main")
          .getByRole("heading", { level: 2, name: "Everything a client" });
        await expect(heading).toBeInViewport();
        await expect
          .poll(
            () =>
              heading.evaluate((element) => {
                let opacity = 1;
                for (
                  let node: Element | null = element;
                  node;
                  node = node.parentElement
                ) {
                  opacity *= Number(getComputedStyle(node).opacity);
                }
                return opacity;
              }),
            { timeout: 2000 },
          )
          .toBe(1);
      });
    });
  });
});

test.describe("landing layout and navigation", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the h1 and the lead are visible above the fold", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    const heading = main.getByRole("heading", { level: 1 });
    const lead = main.getByText("Agencies and freelancers share status");
    await expect(heading).toBeVisible();
    await expect(lead).toBeVisible();

    for (const locator of [heading, lead]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThan(800);
      }
    }
  });

  test("Start free in the hero opens /signup", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "Start free" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("Log in in the header opens /login", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Log in" })
      .click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the Features anchor scrolls the heading below the sticky header", async ({
    page,
  }) => {
    await page.goto("/");

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Features" })
      .click();
    await expect(page).toHaveURL(/#features$/);

    const heading = page
      .getByRole("main")
      .getByRole("heading", { level: 2, name: "Everything a client" });
    await expect(heading).toBeInViewport();

    // Poll: the scroll and the reveal transform settle after the click.
    await expect
      .poll(async () => {
        const headerBox = await page.getByRole("banner").boundingBox();
        const headingBox = await heading.boundingBox();
        if (!headerBox || !headingBox) {
          return null;
        }
        return headingBox.y >= headerBox.y + headerBox.height;
      })
      .toBe(true);
  });

  // No other spec opens "/" while signed in, so this one owns that check.
  test("a signed-in user opening / is redirected into the workspace", async ({
    page,
  }) => {
    await login(page, "owner@clientdesk.test");

    await page.goto("/");
    await expect(page).toHaveURL(/\/w\/[a-z0-9-]+$/);
  });
});

test.describe("landing at 375px", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("metric labels in the hero preview each fit on one line", async ({
    page,
  }) => {
    await page.goto("/");

    const labels = page.locator("main .hero-rise [data-metric-label]");
    await expect(labels.first()).toBeAttached();

    let visible = 0;
    for (const label of await labels.all()) {
      if (!(await label.isVisible())) {
        continue;
      }
      visible += 1;
      const { height, lineHeight } = await label.evaluate((element) => {
        const computed = getComputedStyle(element);
        const parsed = Number.parseFloat(computed.lineHeight);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.isNaN(parsed)
            ? Number.parseFloat(computed.fontSize) * 1.2
            : parsed,
        };
      });
      expect(height).toBeLessThan(lineHeight * 1.6);
    }
    expect(visible).toBeGreaterThanOrEqual(2);
  });
});

async function openLanding(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(
    colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
  );
}

async function tabTo(page: Page, target: Locator, maxPresses = 60) {
  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error("The link was never reached with the Tab key");
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`landing visuals (${colorScheme})`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("the closing panel links show a visible keyboard focus outline", async ({
      page,
    }) => {
      await openLanding(page, colorScheme);

      const panelLinks = page
        .getByRole("main")
        .locator("section")
        .last()
        .getByRole("link");
      await expect(panelLinks).toHaveCount(2);

      for (const link of await panelLinks.all()) {
        await tabTo(page, link);
        await expect
          .poll(async () => {
            const outline = await link.evaluate((element) => {
              const computed = getComputedStyle(element);
              return {
                style: computed.outlineStyle,
                width: computed.outlineWidth,
                color: computed.outlineColor,
              };
            });
            if (outline.style !== "solid" || outline.width === "0px") {
              return 0;
            }
            return contrastRatio(
              page,
              outline.color,
              // The outline sits outside the button, on the panel.
              await backgroundBehind(link.locator("xpath=..")),
            );
          })
          .toBeGreaterThanOrEqual(3);
      }
    });

    test("landing shadows keep their blurred layer next to the ring", async ({
      page,
    }) => {
      await openLanding(page, colorScheme);

      const blurs = await page
        .locator("main .hero-rise .landing-shadow")
        .first()
        .evaluate((element) => {
          const value = getComputedStyle(element).boxShadow;
          const layers: string[] = [];
          let depth = 0;
          let current = "";
          for (const char of value) {
            if (char === "(") depth += 1;
            if (char === ")") depth -= 1;
            if (char === "," && depth === 0) {
              layers.push(current);
              current = "";
            } else {
              current += char;
            }
          }
          layers.push(current);
          return layers.map((layer) => {
            const lengths = layer
              .replace(/\([^)]*\)/g, "")
              .match(/-?\d+(?:\.\d+)?px/g);
            return lengths ? Number.parseFloat(lengths[2] ?? "0") : 0;
          });
        });
      expect(Math.max(...blurs)).toBeGreaterThan(20);
    });

    test("the hero and closing outline buttons have a 3:1 border", async ({
      page,
    }) => {
      await openLanding(page, colorScheme);

      const main = page.getByRole("main");
      const cases = [
        {
          link: main.getByRole("link", { name: "Log in" }).first(),
          own: false,
        },
        { link: main.getByRole("link", { name: "Log in" }).last(), own: true },
      ];
      for (const { link, own } of cases) {
        const border = await link.evaluate(
          (element) => getComputedStyle(element).borderTopColor,
        );
        const background = own
          ? await backgroundBehind(link)
          : await page.evaluate(
              () => getComputedStyle(document.body).backgroundColor,
            );
        expect(
          await contrastRatio(page, border, background),
        ).toBeGreaterThanOrEqual(3);
      }
    });

    test("the closing paragraph has body-text contrast on the panel", async ({
      page,
    }) => {
      await openLanding(page, colorScheme);

      const paragraph = page
        .getByRole("main")
        .getByText("Set up a workspace in a minute");
      const color = await paragraph.evaluate(
        (element) => getComputedStyle(element).color,
      );
      expect(
        await contrastRatio(page, color, await backgroundBehind(paragraph)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe("landing structure", () => {
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

  test("the first Tab stop is a skip link that moves focus to main", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
  });

  test("anchor jumps leave room for the sticky header without per-section offsets", async ({
    page,
  }) => {
    await page.goto("/");

    const paddingTop = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingTop,
    );
    expect(paddingTop).toBe("80px");

    const offsets = await page
      .locator("#features, #how-it-works")
      .evaluateAll((sections) =>
        sections.map((section) => getComputedStyle(section).scrollMarginTop),
      );
    expect(offsets).toEqual(["0px", "0px"]);
  });

  test("feature preview cards do not lift or glow on hover", async ({
    page,
  }) => {
    await page.goto("/");

    const stage = page.locator("#features .landing-stage").first();
    await stage.scrollIntoViewIfNeeded();
    const before = await stage.boundingBox();
    const shadowBefore = await stage.evaluate(
      (element) =>
        getComputedStyle(element.firstElementChild ?? element).boxShadow,
    );

    await stage.hover({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(400);

    expect(await stage.boundingBox()).toEqual(before);
    expect(
      await stage.evaluate(
        (element) =>
          getComputedStyle(element.firstElementChild ?? element).boxShadow,
      ),
    ).toBe(shadowBefore);
  });

  test("the GitHub link announces the new tab and has a 28px target", async ({
    page,
  }) => {
    await page.goto("/");

    const link = page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Source on GitHub (opens in a new tab)" });
    await expect(link).toHaveCount(1);
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(28);
  });
});
