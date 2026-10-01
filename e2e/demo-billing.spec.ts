import { test, expect } from "@playwright/test";
import { startDemo } from "./support/demo";

test.describe("demo billing", () => {
  test("the Pro sandbox workspace explains itself and links to the Free workspace", async ({
    page,
  }) => {
    const workspacePath = await startDemo(page, "agency");

    await page.goto(`${workspacePath}/settings/billing`);
    await expect(
      page.getByText(
        "This demo workspace is on Pro, so every feature is unlocked.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Pro", { exact: true })).toBeVisible();
    // Nothing to manage on a pinned row without a Stripe customer.
    await expect(
      page.getByRole("button", { name: "Manage subscription" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resync" })).toHaveCount(0);
    await expect(page.getByText("No billing account found")).toHaveCount(0);

    const link = page.getByRole("link", { name: "Northwind Labs" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      "href",
      /^\/w\/northwind-labs-[a-z0-9]+\/settings\/billing$/,
    );
    await link.click();

    // CI has no Stripe keys: the Free workspace shows the unconfigured state,
    // and the regular Test mode card still carries the test-card note.
    await expect(page).toHaveURL(
      /\/w\/northwind-labs-[a-z0-9]+\/settings\/billing$/,
    );
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    await expect(page.getByText("Billing is not configured.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upgrade to Pro" }),
    ).toBeDisabled();
    await expect(
      page.getByText(/Use test card 4242 4242 4242 4242/),
    ).toBeVisible();
  });
});
