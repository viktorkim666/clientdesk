# Plan: Brand and polish

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 5 "Demo and launch", first half. The owner split milestone 5 into two plans on 2026-09-30: this one, then "Demo and launch" (demo buttons, AI budget, deploy, README, video).
**Complexity**: Medium

## Summary

The product works, but a visitor still sees the default Next.js favicon, a generic Lucide icon as the logo, no social preview, and test data such as "Client A Inc." and "Olivia Owner". This plan adds a real logo mark, a favicon and Apple icon, and an Open Graph image. It also seeds a realistic demo workspace and closes the three app-screens follow-ups. It ends with a visual acceptance pass over every screen, filled with that data, in both themes at 1440 and 375 px.

## Decisions

- **Logo mark "two cards"** (owner, 2026-09-30): an indigo rounded square with two offset rounded cards, the back one white at 45% opacity and the front one solid white. The two cards are the agency and the client. The tile uses `--primary`, so dark mode gets the lighter indigo. The cards stay white in both themes.
- **Icons**: `src/app/icon.svg` for modern browsers and `src/app/apple-icon.tsx` (180 px PNG through `ImageResponse`). `src/app/favicon.ico` is regenerated from the same mark with 16 and 32 px frames, so `/favicon.ico` requests stop showing the Next logo.
- **Social preview**: `src/app/opengraph-image.tsx` at 1200×630, with the mark, the wordmark, the one-line pitch and a simplified product frame on a dark indigo background. `twitter-image.tsx` re-exports it. `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` so the image URL is absolute.
- **Demo data lives in its own workspace** (owner, 2026-09-30): "Northwind Studio", appended to `supabase/seed.sql` with its own UUID prefix. This mirrors the existing Pro-plan fixture for `e2e/ai-draft.spec.ts`, so `supabase/config.toml` stays untouched. The test fixtures (Acme Agency, Client A Inc., fixed UUIDs) do not change. pgTAP counts run under each test user's JWT, so a workspace they don't belong to stays invisible to them.
- **Demo content**: Pro plan, 5 clients and 10 projects (8 active, 1 on hold, 1 done), so the landing preview's "8 active projects, 5 clients" is true. Updates and comments are spread over the last 7 days, with timestamps relative to `now()`: the counts are fresh after each reset and decay as the database ages. There are file rows too. Client names match the landing preview (Acme Bakery, Lumen Dental and so on), so the landing and the app tell the same story.
- **Demo files are metadata only in this plan.** Local Storage blobs can't be written from SQL. Uploading real blobs belongs to the demo reset job in the "Demo and launch" plan. Until then, the file list looks right but a download returns an error.
- **Company avatars**: clients get a `CompanyAvatar` with a `Building2` icon instead of initials. People keep `UserAvatar`.
- **Duplicate workspace title on phone**: the dashboard `h1` becomes "Overview". The workspace name stays in the sidebar switcher on desktop and in the top bar on phone.
- **Dashboard balance**: re-check it with the demo data before changing anything. Change the layout only if the left column still looks empty next to the feed.

## Patterns to Mirror

| Category         | Source                                                               | Pattern                                                                                          |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Naming           | `src/components/user-avatar.tsx`                                     | One kebab-case file per shared component, named export, colocated `*.test.ts`                    |
| Brand component  | `src/components/brand-mark.tsx`                                      | `BrandMark` renders the mark `aria-hidden` inside a labelled link; the only place the logo lives |
| Seed fixture     | `supabase/seed.sql` (Pro workspace, prefix 2)                        | Separate workspace, own UUID prefix, comment explaining why, billing row written by the seed     |
| Metadata files   | `node_modules/next/dist/docs/.../app-icons.md`, `opengraph-image.md` | `ImageResponse` from `next/og`, exported `size`, `contentType`, `alt`                            |
| Unit tests       | `src/components/user-avatar.test.ts`                                 | `createElement` + `renderToStaticMarkup`, assertions on markup                                   |
| Page tests       | `src/app/w/[slug]/page.test.ts`                                      | `vi.hoisted` Supabase mocks, assert rendered headings                                            |
| e2e              | `e2e/landing.spec.ts`, `e2e/dashboard.spec.ts`                       | Role-based locators, seeded users signed in through `e2e/support`                                |
| Errors / logging | none                                                                 | This plan adds no runtime error paths; image routes are static and fail the build if they break  |

## Files to Change

| File                                                                                      | Action | Why                                                        |
| ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `src/components/logo-mark.tsx` (+ test)                                                   | CREATE | The SVG mark, reused by `BrandMark`, icons and OG image    |
| `src/components/brand-mark.tsx`                                                           | UPDATE | Swap `PanelsTopLeft` for `LogoMark`                        |
| `src/app/icon.svg`                                                                        | CREATE | Browser tab icon                                           |
| `src/app/apple-icon.tsx`                                                                  | CREATE | Home-screen icon                                           |
| `src/app/favicon.ico`                                                                     | UPDATE | Replace the Next logo                                      |
| `scripts/generate-favicon.mts`                                                            | CREATE | Reproducible ICO build from the mark                       |
| `src/app/opengraph-image.tsx`, `twitter-image.tsx`                                        | CREATE | Social preview                                             |
| `src/app/layout.tsx`                                                                      | UPDATE | `metadataBase`, Open Graph and Twitter card metadata       |
| `supabase/seed.sql`                                                                       | UPDATE | Northwind Studio demo workspace                            |
| `src/components/company-avatar.tsx` (+ test)                                              | CREATE | Building icon for companies                                |
| `src/app/w/[slug]/clients/page.tsx`, `projects/page.tsx`, `projects/[projectId]/page.tsx` | UPDATE | Use `CompanyAvatar` for clients                            |
| `src/app/w/[slug]/page.tsx` (+ test)                                                      | UPDATE | `h1` "Overview"; layout only if the balance check fails    |
| `e2e/brand.spec.ts`                                                                       | CREATE | Icons, OG image and metadata served                        |
| `e2e/demo-data.spec.ts`                                                                   | CREATE | Demo owner and client see the demo workspace, not fixtures |
| `README.md`                                                                               | UPDATE | Demo workspace accounts for local development              |

## Tasks

### Task 1: Logo mark and brand component

- **Action**: Create `LogoMark` (inline SVG, `aria-hidden`, tile fill from `--primary`, white cards). Use it in `BrandMark`. Tests first: the mark renders two card shapes and no Lucide icon, and `BrandMark` keeps its accessible name.
- **Mirror**: `brand-mark.tsx`, `user-avatar.test.ts`
- **Validate**: `pnpm test src/components`

### Task 2: Favicon, Apple icon, social preview

- **Action**: Add `icon.svg`, `apple-icon.tsx`, the regenerated `favicon.ico` (script packs 16 and 32 px PNGs rendered with `next/og`), `opengraph-image.tsx` and `twitter-image.tsx`. Set `metadataBase`, `openGraph` and `twitter: { card: "summary_large_image" }` in the root layout. e2e first: `<link rel="icon">` points at the SVG, `/apple-icon`, `/opengraph-image` and `/twitter-image` return PNGs of the right size, and `og:image` is an absolute URL.
- **Mirror**: Next 16 metadata docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/`
- **Validate**: `pnpm test:e2e e2e/brand.spec.ts`, then look at the rendered PNGs

### Task 3: Demo workspace seed

- **Action**: Append Northwind Studio to `supabase/seed.sql`: owner and member accounts, 5 clients, two of them with a client login, a Pro billing row written before the clients (the Free limit trigger allows only 2), 10 projects, about 15 updates and 10 comments over 7 days, and about 8 file rows. e2e first: the demo owner lands on the demo dashboard with 10 projects, and a demo client sees only their own projects.
- **Mirror**: the Pro-workspace block in `supabase/seed.sql`
- **Validate**: `supabase db reset`, `pnpm db:test`, `pnpm test:e2e e2e/demo-data.spec.ts`

### Task 4: App-screens follow-ups

- **Action**: `CompanyAvatar` on the clients list, projects list and project page. Dashboard `h1` becomes "Overview" (update the page test first). Check the dashboard balance with the demo data and change the layout only if needed.
- **Mirror**: `user-avatar.tsx`, `page.test.ts`
- **Validate**: `pnpm test`, `pnpm test:e2e e2e/dashboard.spec.ts e2e/mobile-layout.spec.ts`

### Task 5: Visual acceptance pass

- **Action**: Screenshot every screen with the demo data in light and dark at 1440 and 375 px: landing, login, signup, onboarding, dashboard (staff and client), projects, project detail, clients, members, billing, invite, not-found and error. Review them against the ui-ux-pro-max checklist. Fix what it finds, each fix with a test where one can prove it. Record the result in this plan.
- **Mirror**: the QA pass from `.claude/plans/landing-page.plan.md`
- **Validate**: screenshots reviewed with the owner before Gate 2

### Task 6: Docs and reviews

- **Action**: README section on the demo workspace. Reviews by `react-reviewer`, `typescript-reviewer`, `database-reviewer` (seed) and `a11y-architect`.
- **Validate**: full validation below

## Visual acceptance outcome

The first pass took 53 screenshots in both themes at 1440 and 375. The QA agent reported no blockers, but a second look at the screenshots found one: in dark mode the logo cards took `--primary-foreground`, which is near-black there. It was fixed together with these findings the owner chose to fix:

- 44 px touch targets below `sm` in the button, input and select primitives, with desktop sizes unchanged and asserted
- the files list on phone: the name gets its own line and wraps, size and date never break, and Download and Delete are real buttons
- member rows aligned, and Remove shown as a labelled destructive button at every width
- the landing glow and grid behind login, signup, invite, onboarding and not-found; not-found also gets the brand header
- the sidebar footer shows the name with the email below it
- the projects list sorted newest first, like the dashboard
- dashboard metrics that fit on one line at 375

Onboarding was not captured, because no seeded account lacks a workspace.

Deferred by the owner:

- a collapsed "Reply" instead of an open comment box under every update
- a mobile menu for the landing's section links
- labels for the comment delete button
- a switcher that doesn't look interactive for a client with one workspace

## Follow-ups for "Demo and launch"

From the database review of the demo seed:

- Move the Northwind block into its own file before it goes near a hosted project. `seed.sql` also plants the test fixtures.
- Don't publish `password123`. Sign demo visitors in through a server action, and block password, email and account changes for the demo users.
- Insert `auth.identities` rows for the demo users.
- The fake Stripe customer keeps the workspace on Pro locally. On a hosted project a billing sync would find no such customer, so pin the plan or skip the sync for the demo workspace.
- The reset job has to delete and re-insert the workspace and its users (the inserts are not idempotent), re-anchor timestamps, and upload real blobs for the file rows.
- Keep outgoing mail away from the `.test` addresses.

`metadataBase` reads `NEXT_PUBLIC_SITE_URL`, so preview deployments point Open Graph images at the production host. Decide on a preview fallback when the deploy is set up.

## Validation

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm build
supabase db reset && pnpm db:test
pnpm test:e2e
```

## Risks

| Risk                                                                                           | Likelihood | Mitigation                                                                                        |
| ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| Demo rows leak into fixture assertions                                                         | Low        | Own users and UUID prefix; pgTAP counts are RLS-scoped per test user; full `db:test` and e2e runs |
| Seed inserts hit the Free client limit                                                         | High       | Billing row goes in before clients                                                                |
| Demo file downloads fail (no blobs)                                                            | Certain    | Documented; blobs arrive with the reset job in "Demo and launch"                                  |
| `ImageResponse` has only Geist Regular bundled, so the OG headline is lighter than the landing | Medium     | Accept Regular at a larger size, or vendor Geist SemiBold (OFL) if the image looks weak           |
| e2e link names collide with new text ("Overview")                                              | Low        | Checked against the known substring collisions before naming                                      |
| Visual pass finds more than this branch should hold                                            | Medium     | Fix blockers here; list the rest as follow-ups for the owner to schedule                          |

## Acceptance

- [x] No default Next.js icon anywhere; tab, Apple and social previews show the new mark
- [x] Demo workspace seeded; fixture tests unchanged and green
- [x] Company avatars, dashboard title and balance follow-ups closed
- [x] Every screen reviewed with demo data in both themes at 1440 and 375
- [x] Validation passes locally and in CI
- [x] Patterns mirrored, not reinvented
