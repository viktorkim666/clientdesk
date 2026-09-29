import { test, expect } from "@playwright/test";
import { readLastInviteUrlFor } from "./support/emails";

test.describe("stale rows resync after an in-place revalidation", () => {
  test("a member's role changed by a second owner shows up once this page's own action revalidates it", async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const owner1Email = `owner1-${suffix}@e2e.clientdesk.test`;
    const owner2Email = `owner2-${suffix}@e2e.clientdesk.test`;
    const memberEmail = `member-${suffix}@e2e.clientdesk.test`;

    // Owner 1 signs up and creates the workspace.
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Owner One");
    await page.getByLabel("Email").fill(owner1Email);
    await page.getByLabel("Password").fill("correct-horse-1");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.getByLabel("Workspace name").fill("E2E Resync Agency");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(/\/w\/e2e-resync-agency-[a-z0-9]+$/);

    // Owner 1 invites Owner 2 (also an owner, so they can change roles too)
    // and a plain member, who is the row whose role will change below.
    await page.getByRole("link", { name: "Members" }).click();
    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(owner2Email);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Owner", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("cell", { name: owner2Email })).toBeVisible();

    await page.getByRole("button", { name: "Invite" }).click();
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("cell", { name: memberEmail })).toBeVisible();

    const owner2InviteUrl = await readLastInviteUrlFor(owner2Email);
    const memberInviteUrl = await readLastInviteUrlFor(memberEmail);

    // Owner 2 accepts in a separate browser context so it doesn't inherit
    // Owner 1's session cookies.
    const owner2Context = await browser.newContext();
    const owner2Page = await owner2Context.newPage();
    await owner2Page.goto(`/signup?next=${new URL(owner2InviteUrl).pathname}`);
    await owner2Page.getByLabel("Full name").fill("E2E Owner Two");
    await owner2Page.getByLabel("Email").fill(owner2Email);
    await owner2Page.getByLabel("Password").fill("correct-horse-1");
    await owner2Page.getByRole("button", { name: "Sign up" }).click();
    await expect(owner2Page).toHaveURL(/\/invite\//);
    await owner2Page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(owner2Page).toHaveURL(/\/w\/e2e-resync-agency-[a-z0-9]+$/);

    // The plain member accepts in its own context too.
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/signup?next=${new URL(memberInviteUrl).pathname}`);
    await memberPage.getByLabel("Full name").fill("E2E Plain Member");
    await memberPage.getByLabel("Email").fill(memberEmail);
    await memberPage.getByLabel("Password").fill("correct-horse-1");
    await memberPage.getByRole("button", { name: "Sign up" }).click();
    await expect(memberPage).toHaveURL(/\/invite\//);
    await memberPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(memberPage).toHaveURL(/\/w\/e2e-resync-agency-[a-z0-9]+$/);

    // Owner 1 reloads the Members page once everyone is in, capturing a
    // snapshot that shows the plain member's role as "member" - this is the
    // stale render the resync has to correct later without a full reload.
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Role for E2E Plain Member" }),
    ).toContainText("Member");

    // Owner 2, from their own page, promotes the plain member to "owner".
    // `revalidatePath` in `changeMemberRole` invalidates the Members route's
    // cache server-side, but Owner 1's browser has no way to learn that on
    // its own - nothing pushes updates to an already-open tab, and Next.js
    // Link navigation to a route the browser is already on doesn't refetch
    // it. So the plain "navigate away, then back" a naive reading of "no
    // full reload" suggests is not actually observable here: it would either
    // no-op (same route) or unmount and remount `MemberRow` on the way to a
    // different route, which would pick up fresh data regardless of the
    // resync fix and prove nothing about it.
    //
    // What genuinely keeps the same `MemberRow` instance mounted while its
    // `member.role` prop changes is Owner 1 triggering their own Server
    // Action on this same page: any action that calls
    // `revalidatePath("/w/.../settings/members")` makes Next.js refetch this
    // route's Server Components in place, reconciling into the already
    // mounted client tree - the exact situation the resync fix targets.
    // Sending one more invitation is a real, low-effort example of such an
    // action.
    await owner2Page.getByRole("link", { name: "Members" }).click();
    await owner2Page
      .getByRole("combobox", { name: "Role for E2E Plain Member" })
      .click();
    await owner2Page
      .getByRole("option", { name: "Owner", exact: true })
      .click();
    await expect(
      owner2Page.getByRole("combobox", { name: "Role for E2E Plain Member" }),
    ).toContainText("Owner");

    // Owner 1, still on the same, now-stale Members page (no navigation, no
    // reload), sends an unrelated invitation. Its own `revalidatePath` call
    // refreshes this page in place and should carry the plain member's
    // now-updated role along with it.
    await page.getByRole("button", { name: "Invite" }).click();
    await page
      .getByLabel("Email")
      .fill(`bystander-${suffix}@e2e.clientdesk.test`);
    await page.getByLabel("Role", { exact: true }).click();
    await page.getByRole("option", { name: "Member", exact: true }).click();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(
      page.getByRole("cell", {
        name: `bystander-${suffix}@e2e.clientdesk.test`,
      }),
    ).toBeVisible();

    // The role select for the promoted member now reads "owner" rather than
    // the stale "member" it showed before this refresh.
    await expect(
      page.getByRole("combobox", { name: "Role for E2E Plain Member" }),
    ).toContainText("Owner");

    await owner2Context.close();
    await memberContext.close();
  });
});
