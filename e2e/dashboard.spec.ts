import { test, expect } from "@playwright/test";
import { login } from "./support/auth";
import {
  createClientViaDialog,
  createProjectAndOpen,
  signUpOwnerWithEmptyWorkspace,
} from "./support/workspace";

// Fixed ids and names from supabase/seed.sql (workspace acme-agency).
const CLIENT_A_EMAIL = "client-a@clientdesk.test";
const CLIENT_A_PROJECT = "Client A Website Redesign";
const CLIENT_A_PROJECT_ID = "d0000000-0000-0000-0000-00000000000a";
const CLIENT_B_PROJECT = "Client B Brand Refresh";
const CLIENT_B_PROJECT_ID = "d0000000-0000-0000-0000-00000000000b";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Everything on Client B's side of the seed that Client A must never see.
// The seed has no comment on Client B's project, so there is no Client B
// comment body to list.
const CLIENT_B_LEAKS = [
  CLIENT_B_PROJECT,
  "Client B LLC",
  "Blake Client B",
  "Brand refresh is paused pending budget approval.",
  "brand-refresh-brief.pdf",
];

test.describe("dashboard", () => {
  test("a posted update appears first in Recent activity", async ({ page }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const clientName = `Dash Client ${suffix}`;
    const projectName = `Dash Project ${suffix}`;
    const workspaceUrl = await signUpOwnerWithEmptyWorkspace(
      page,
      "dash-feed",
      test.info().workerIndex,
    );
    await createClientViaDialog(page, workspaceUrl, clientName);
    await createProjectAndOpen(page, workspaceUrl, projectName, clientName);

    await page
      .getByPlaceholder("Post an update for the client...")
      .fill("Dashboard feed check.");
    await page.getByRole("button", { name: "Post update" }).click();
    await expect(page.getByText("Dashboard feed check.")).toBeVisible();

    await page.getByRole("link", { name: "Dashboard" }).click();
    const activity = page.getByRole("region", { name: "Recent activity" });
    await expect(activity.getByRole("listitem").first()).toContainText(
      `posted an update on ${projectName}`,
    );
    await expect(
      page.getByRole("region", { name: "Projects" }).getByRole("link", {
        name: projectName,
      }),
    ).toBeVisible();
  });

  test("a client sees only their own client's activity and counts", async ({
    page,
  }) => {
    await login(page, CLIENT_A_EMAIL);
    const workspaceUrl = page.url();

    const projects = page.getByRole("region", { name: "Projects" });
    await expect(
      projects.getByRole("link", { name: CLIENT_A_PROJECT }),
    ).toBeVisible();
    await expect(projects.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Clients" })).toHaveCount(0);

    // Client A's seeded activity: one update, two comments, two files.
    const activity = page.getByRole("region", { name: "Recent activity" });
    const rows = activity.getByRole("listitem");
    await expect(rows).toHaveCount(5);

    // Every row points at Client A's project, and staff authors keep their
    // names although the client cannot see any other client's profile.
    for (const row of await rows.all()) {
      await expect(row.getByRole("link")).toHaveAttribute(
        "href",
        new RegExp(`/projects/${CLIENT_A_PROJECT_ID}$`),
      );
      await expect(row).not.toContainText("Unknown project");
      await expect(row).not.toContainText("Former member");
    }
    await expect(activity).toContainText(
      `Olivia Owner posted an update on ${CLIENT_A_PROJECT}`,
    );
    await expect(activity).toContainText(
      `Carla Client A commented on ${CLIENT_A_PROJECT}`,
    );
    await expect(activity).toContainText(
      `Olivia Owner commented on ${CLIENT_A_PROJECT}`,
    );
    await expect(activity).toContainText(
      `Olivia Owner uploaded kickoff-notes.pdf to ${CLIENT_A_PROJECT}`,
    );
    await expect(activity).toContainText(
      `Carla Client A uploaded site-copy-feedback.docx to ${CLIENT_A_PROJECT}`,
    );

    // Nothing of Client B's anywhere on the page.
    const body = page.locator("body");
    for (const leak of CLIENT_B_LEAKS) {
      await expect(body).not.toContainText(leak);
    }
    await expect(body).not.toContainText("Unknown project");
    await expect(body).not.toContainText("Former member");

    // Metrics count Client A's rows only. The seeded update is dated when the
    // database was seeded, so the weekly count depends on its age.
    const updateTime = await activity
      .getByRole("listitem")
      .filter({ hasText: "posted an update" })
      .locator("time")
      .getAttribute("datetime");
    expect(updateTime).not.toBeNull();
    const updatesThisWeek =
      Date.now() - new Date(updateTime ?? "").getTime() < WEEK_MS ? 1 : 0;

    await expect(
      page.locator('[data-slot="card"]').filter({ hasText: "Active projects" }),
    ).toContainText("of 1");
    await expect(
      page
        .locator('[data-slot="card"]')
        .filter({ hasText: "Updates this week" }),
    ).toHaveText(new RegExp(`Updates this week\\s*${updatesThisWeek}$`));

    // Client B's project is not reachable by URL either.
    await page.goto(`${workspaceUrl}/projects/${CLIENT_B_PROJECT_ID}`);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("dashboard links are underlined without hover", async ({ page }) => {
    await login(page, CLIENT_A_EMAIL);

    const activityLink = page
      .getByRole("region", { name: "Recent activity" })
      .getByRole("link", { name: CLIENT_A_PROJECT })
      .first();
    const decoration = await activityLink.evaluate(
      (element) => getComputedStyle(element).textDecorationLine,
    );
    expect(decoration).toContain("underline");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`keyboard focus on dashboard links has a 3:1 outline in ${colorScheme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await login(page, CLIENT_A_EMAIL);

      const activityLink = page
        .getByRole("region", { name: "Recent activity" })
        .getByRole("link", { name: CLIENT_A_PROJECT })
        .first();

      const rowLink = page
        .getByRole("region", { name: "Projects" })
        .getByRole("link", { name: CLIENT_A_PROJECT });
      for (const [label, link] of [
        ["activity link", activityLink],
        ["project row link", rowLink],
      ] as const) {
        // Move focus with the keyboard so :focus-visible applies.
        await link.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(link, label).toBeFocused();

        const outline = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          const toRgb = (color: string): [number, number, number, number] => {
            const context = document.createElement("canvas").getContext("2d");
            if (!context) throw new Error("no 2d context");
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
              0,
              0,
              1,
              1,
            ).data;
            return [r, g, b, a];
          };
          const luminance = ([r, g, b]: [number, number, number, number]) => {
            const channel = (value: number) => {
              const v = value / 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            };
            return (
              0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
            );
          };
          const outlineRgb = toRgb(style.outlineColor);
          const pageRgb = toRgb(
            getComputedStyle(document.body).backgroundColor,
          );
          const [light, dark] = [
            Math.max(luminance(outlineRgb), luminance(pageRgb)),
            Math.min(luminance(outlineRgb), luminance(pageRgb)),
          ];
          return {
            style: style.outlineStyle,
            width: parseFloat(style.outlineWidth),
            alpha: outlineRgb[3],
            contrast: (light + 0.05) / (dark + 0.05),
          };
        });
        expect(outline.style, label).toBe("solid");
        expect(outline.width, label).toBeGreaterThanOrEqual(2);
        expect(outline.alpha, label).toBe(255);
        expect(outline.contrast, label).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test("a fresh workspace explains itself and links to the project list", async ({
    page,
  }) => {
    await signUpOwnerWithEmptyWorkspace(
      page,
      "dash-empty",
      test.info().workerIndex,
    );

    await expect(page.getByText("Start your first project")).toBeVisible();
    await expect(page.getByText("No activity yet")).toBeVisible();

    await page.getByRole("link", { name: "Go to project list" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(
      page.getByRole("heading", { name: "Projects", level: 1 }),
    ).toBeVisible();
  });
});
