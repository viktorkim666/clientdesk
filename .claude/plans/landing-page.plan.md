# Plan: Landing page

**Source PRD**: `.claude/prds/clientdesk-design.prd.md`
**Selected Milestone**: 3. Landing page
**Complexity**: Medium

## Summary

The home page becomes a full product landing page in the indigo direction. It should read as an expensive, finished SaaS site, in the class of Linear, Vercel or Resend. A visitor sees what Clientdesk is and who it is for in the first screen, scrolls through four features with small product previews and a three-step walkthrough, and ends at sign up or log in. The product is shown with a coded preview built from the app's own components on static data, so it follows the theme and stays sharp at any size. The page also stops exposing links as buttons on the home, not-found and invite pages.

## Decisions

- **Layout (hybrid of mockups A and B, picked by the owner).**
  - Sticky header: `BrandMark`, anchor links "Features" and "How it works", `ThemeToggle`, "Log in" (ghost) and "Sign up" (primary). The header gets a translucent background with a backdrop blur once the page scrolls under it. On phones the anchors are hidden and the two actions stay.
  - Hero, centered:
    - a small eyebrow: "Client portal for small agencies";
    - an h1 around 56–64 px on desktop and 36–40 px on phones, tight tracking, at most two lines;
    - one sentence underneath;
    - the actions "Start free" (to `/signup`) and "Log in" (to `/login`).
  - A large product preview under the hero: a browser-style frame with the dashboard (metric cards, the project list with status badges, and the activity feed), plus one floating card layered over its corner (a project update with a comment). Behind it sits a soft indigo radial glow and a faint grid that fades out at the edges. In dark mode the glow is stronger and the frame border lighter.
  - Features: four alternating rows, text on one side and a mini preview on the other. They stack on phones.
    1. Roles and access. Owner, member and client roles, email invites, and clients see only their own projects, enforced by row-level security in Postgres.
    2. Files and conversation. Updates, comments and file sharing on each project.
    3. AI update drafts. Claude writes a first draft of a client update from recent activity; the agency edits it before posting.
    4. Billing. Stripe subscription per workspace; Free covers up to 2 clients (from `FREE_CLIENT_LIMIT`), and Pro adds unlimited clients and AI drafts. There is no pricing section.
  - "How it works" in three steps: create a workspace, invite your client, share updates and files.
  - A final CTA band: short heading, one line, "Start free" and "Log in".
  - Footer: brand mark, a one-line product description, a "Source on GitHub" link to the public repo, and the year.
- **Honesty.** No invented customer logos, testimonials, ratings or usage numbers. Preview data is plainly sample content (fictional agency and client names).
- **Product preview.** Server-rendered JSX built from `StatusBadge`, `RoleBadge`, `UserAvatar` and the card styles, using fixed sample data in a module next to the page. The previews are decorative: each frame gets `aria-hidden="true"` and `inert` so it adds no links, headings or tab stops, and the text next to it carries the meaning. No images are shipped.
- **Motion.**
  - Hover transitions of 150–300 ms on links and buttons.
  - Scroll reveal in CSS only: sections fade and rise slightly through `animation-timeline: view()`. It is wrapped in `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)`, so browsers without support and visitors with reduced motion get the final, static state. No JavaScript and no new dependency.
  - The hero preview rises in once on load with a CSS animation, under the same reduced-motion guard.
- **Links styled as buttons.** Every link that looks like a button is a `<Link className={buttonVariants(...)}>`, so it keeps `role=link`. This also fixes `src/app/not-found.tsx` and `src/app/invite/[token]/page.tsx`, which currently use `Button render={<Link/>} nativeButton={false}` and announce themselves as buttons.
- **Signed-in visitors.** The current redirect in `src/app/page.tsx` (to the workspace or onboarding) stays unchanged.
- **Metadata.** The home page keeps the root title, and the description gets a sharper one-sentence pitch. Social images stay out of scope, as the PRD says.
- **Unchanged.** Routes, auth, the database, server actions and the app screens.

## Patterns to Mirror

| Category        | Source                                                                             | Pattern                                                                                 |
| --------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Link as button  | `src/app/w/[slug]/page.tsx:221`, `projects/page.tsx:89`                            | `<Link className={buttonVariants({ variant, size })}>`                                  |
| Brand and theme | `src/components/brand-mark.tsx`, `outside-workspace-header.tsx`                    | `BrandMark` plus `ThemeToggle` in a header row                                          |
| Shared parts    | `src/components/status-badge.tsx`, `role-badge.tsx`, `user-avatar.tsx`             | reused as-is inside the previews                                                        |
| Theme tokens    | `src/app/globals.css`                                                              | oklch pairs in `:root` and `.dark`; new landing utilities live in `@layer` blocks there |
| Component tests | `src/components/page-header.test.ts`                                               | `createElement` + `renderToStaticMarkup`, assert markup and attributes                  |
| E2E             | `e2e/accessibility.spec.ts`, `e2e/mobile-layout.spec.ts`, `e2e/typography.spec.ts` | axe in both themes, 375 px scroll check, computed style checks                          |

## Files to Change

| File                                                       | Action | Why                                                                        |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `src/app/page.tsx`                                         | UPDATE | compose the landing sections; keep the signed-in redirect                  |
| `src/components/landing/site-header.tsx`                   | CREATE | sticky header with anchors, theme toggle and actions                       |
| `src/components/landing/hero.tsx`                          | CREATE | eyebrow, h1, lead, actions                                                 |
| `src/components/landing/product-preview.tsx`               | CREATE | decorative dashboard frame with the layered update card                    |
| `src/components/landing/feature-rows.tsx` + mini previews  | CREATE | four alternating rows                                                      |
| `src/components/landing/how-it-works.tsx`                  | CREATE | three steps                                                                |
| `src/components/landing/final-cta.tsx`, `site-footer.tsx`  | CREATE | closing CTA band and footer                                                |
| `src/components/landing/sample-data.ts`                    | CREATE | fixed sample content for the previews                                      |
| `src/components/landing/*.test.ts`                         | CREATE | markup tests: link roles and targets, previews are `aria-hidden`/`inert`   |
| `src/app/globals.css`                                      | UPDATE | glow/grid backdrop, reveal keyframes behind `@supports` and reduced motion |
| `src/app/layout.tsx`                                       | UPDATE | sharper description                                                        |
| `src/app/not-found.tsx`, `src/app/invite/[token]/page.tsx` | UPDATE | links styled as buttons keep `role=link`                                   |
| `e2e/landing.spec.ts`                                      | CREATE | content, CTAs, anchors, header, reduced motion, link roles                 |
| `e2e/accessibility.spec.ts`, `e2e/mobile-layout.spec.ts`   | UPDATE | landing in both themes, 375 px and 768 px                                  |
| `README.md`                                                | UPDATE | a short "Landing page" section                                             |
| `.claude/prds/clientdesk-design.prd.md`                    | UPDATE | milestone 3 status, open questions resolved                                |

## Tasks

### Task 1: Links that look like buttons

- **Action**: e2e first. On `/`, the not-found page and an invite page, "Log in", "Sign up", "Back home" and the invite actions are found by `getByRole("link")` and not by `getByRole("button")`. Then switch the three files to `<Link className={buttonVariants(...)}>`. Dismiss task chip `task_501a64e6` once merged.
- **Mirror**: `src/app/w/[slug]/page.tsx:221`.
- **Validate**: `pnpm test:e2e e2e/landing.spec.ts e2e/auth.spec.ts`.

### Task 2: Page frame, header, hero and preview

- **Action**:
  - Unit tests first:
    - the header has "Log in" to `/login` and "Sign up" to `/signup` and anchors to `#features` and `#how-it-works`;
    - the hero has one h1 and "Start free" to `/signup`;
    - every preview root carries `aria-hidden="true"` and `inert` and has no links.
  - Then the sample data, header, hero and product preview, plus the glow and grid backdrop in `globals.css`.
- **Mirror**: `page-header.test.ts`, `brand-mark.tsx`.
- **Validate**: `pnpm test src/components/landing`; `pnpm typecheck`.

### Task 3: Features, steps, final CTA and footer

- **Action**:
  - Unit tests first:
    - four feature rows, each an h3 under the "Features" h2 with `id="features"`;
    - the billing row mentions the Free limit from `FREE_CLIENT_LIMIT`;
    - "How it works" has three ordered steps with `id="how-it-works"`;
    - the footer's GitHub link opens the repo with `rel="noopener noreferrer"`.
  - Then the components, wired into `src/app/page.tsx`.
- **Mirror**: Task 2 components.
- **Validate**: `pnpm test src/components/landing 'src/app/page'`.

### Task 4: Motion

- **Action**:
  - E2E first:
    - with `reducedMotion: "reduce"`, every reveal section has computed `opacity: 1` and no animation;
    - with motion allowed in Chromium, reveal sections have an `animation-timeline` other than `auto`.
  - Then the reveal keyframes, the one-off hero rise and hover transitions.
- **Mirror**: `e2e/typography.spec.ts` (computed style checks).
- **Validate**: `pnpm test:e2e e2e/landing.spec.ts`.

### Task 5: Landing e2e, accessibility and layout

- **Action**:
  - `e2e/landing.spec.ts`: the h1 and pitch are visible above the fold at 1280×800; "Start free" reaches `/signup`; "Log in" reaches `/login`; the "Features" anchor scrolls to its section; a signed-in user opening `/` is still redirected.
  - Accessibility: axe WCAG 2 AA on `/` in both themes, run with reduced motion so no frame is caught mid-fade.
  - Layout: no horizontal scroll on `/` at 375 px and 768 px.
  - Lighthouse accessibility ≥ 95 on `/` (Chrome DevTools audit, recorded in the PR).
- **Mirror**: `e2e/accessibility.spec.ts`, `e2e/mobile-layout.spec.ts`.
- **Validate**: `pnpm test:e2e`.

### Task 6: Visual QA, docs and review

- **Action**:
  - Visual QA in both themes at 1440, 1280, 768 and 375 px against the ui-ux-pro-max checklist and the "expensive SaaS" bar: type scale, spacing rhythm, alignment of the preview, contrast of the glow, header blur, and hover states. Fix every finding.
  - README section, PRD status and resolved open questions, humanized.
  - Reviews: react-reviewer, typescript-reviewer, code-reviewer and a11y-architect. security-reviewer only if the diff touches auth or input handling (it should not).
- **Validate**: the full validation block below.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm test:e2e
pnpm build
git rebase main --exec 'rm -rf .next/dev && pnpm lint && pnpm typecheck && pnpm test'
```

## Risks

| Risk                                                                             | Likelihood | Mitigation                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| New link names collide with existing e2e substring matches ("Sign up", "Log in") | Medium     | e2e selectors on `/` already use these names; keep the header and hero actions distinct ("Start free") and scope by landmark |
| axe catches text mid-animation at low contrast                                   | Medium     | run axe with reduced motion; reveal only moves opacity from 0 to 1 over a short range                                        |
| Scroll-driven animation unsupported in Firefox                                   | High       | `@supports` guard; the page is complete without it                                                                           |
| Preview duplicates headings or links for screen readers                          | Medium     | `aria-hidden` and `inert` on every preview, covered by unit tests                                                            |
| Glow and blur look cheap or cost paint time on phones                            | Medium     | one static radial gradient, blur only on the header; visual QA at 375 px                                                     |
| Five-second test needs a person                                                  | High       | the owner runs it with someone who hasn't seen the app; result noted in the PRD                                              |

## Acceptance

- [x] All tasks complete
- [x] A first-time visitor sees what the product is and who it is for in the first screen, and reaches sign up or log in from the hero, the header and the final CTA
- [x] No link on `/`, the not-found page or the invite page exposes `role=button`
- [x] axe WCAG 2 AA passes on `/` in both themes; no horizontal scroll at 320 px, 375 px, 768 px and 1024 px
- [x] Lighthouse accessibility ≥ 95 on `/` (recorded: 100 on desktop and mobile)
- [x] Reduced motion and unsupported browsers show the full static page
- [x] Visual QA pass in both themes at four widths, findings fixed
- [ ] Validation passes locally and in CI
- [x] Patterns mirrored, not reinvented

## Review outcome

The react, typescript, code and a11y reviews led to these fixes:

- The closing CTA links get a solid 2px focus outline in the panel's foreground colour. The shared ring was indigo on the indigo panel and could not be seen.
- `landing-shadow` is a Tailwind `@utility` now. As a component class, its shadow was overridden by the `ring-1` utility and never rendered.
- The reveal animation runs on smaller blocks (heading blocks, each feature row, the step list, the CTA panel) with a fixed `entry 0% entry 200px` range, not on whole sections.
- `scroll-padding-top` on `html` keeps anchors and focused elements clear of the sticky header.
- A "Skip to main content" link, matching the workspace layout.
- The header "Log in" link is hidden below `sm` so the header fits at 320 px; the hero and the CTA panel still offer it.
- Outline button borders in the hero and the CTA panel reach 3:1 contrast.
- The CTA panel colours come from `--cta` and `--cta-foreground` tokens.
- The hover lift on the decorative previews is gone, since they cannot be clicked.
- The GitHub link says "(opens in a new tab)" to screen readers.
- Tests that could pass without checking anything were tightened (metric labels, motion, link counts).

The header is always translucent with a backdrop blur, rather than turning translucent on scroll as the Decisions section says. That needs no JavaScript.

The five-second test from the PRD still needs a person who has not seen the app; the owner runs it.
