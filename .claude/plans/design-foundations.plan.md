# Plan: Design foundations

**Source PRD**: `.claude/prds/clientdesk-design.prd.md`
**Selected Milestone**: 1. Visual foundations
**Complexity**: Medium

## Summary

Clientdesk gets the "Indigo focus" direction the owner picked from three dashboard mockups: cool zinc greys, a single indigo accent and Geist, in light and dark themes that follow the system until the visitor picks one. The top bar in the workspace becomes a sidebar that turns into a slide-out menu on phones. Automated checks for contrast in both themes and for horizontal scroll at 375 px guard the result. Screen content (dashboard metrics, empty states, the landing page) is left for milestones 2 and 3.

## Decisions

- **Direction.** Option A from the mockups: zinc neutrals, indigo `primary`, `ring` and sidebar accent, Geist kept as the only typeface, radius stays at `0.625rem`. Light `primary` is indigo 600 with white text; dark `primary` is indigo 400 with near-black text, so both pass WCAG AA for button labels.
- **Theme switching.** `next-themes` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`; `suppressHydrationWarning` on `<html>`. The toggle is a dropdown with Light, Dark and System, labelled "Theme", in the sidebar footer and in the corner of the sign-in, sign-up, onboarding and invite pages. The choice lives in `localStorage` (the library default), so there is no cookie and no server change.
- **CSP.** The current policy has no `script-src`, so the library's inline pre-paint script runs as is. When nonce-based CSP lands (a milestone 5 candidate), `ThemeProvider` takes the nonce through its `nonce` prop.
- **App shell.** The shadcn `sidebar` block, added through the CLI in the repo's `base-nova` style, replaces the header in `w/[slug]/layout.tsx`. The sidebar header holds the workspace switcher. The menu has Dashboard, Clients, Projects, Billing and Members with lucide icons, the same role rules as today and `aria-current="page"` on the open section. The footer holds the theme toggle and "Sign out". Below `md` the sidebar opens as a sheet from a top-bar button labelled "Open navigation". On desktop the links stay visible, so the existing e2e specs keep clicking them by name.
- **Contrast and layout checks.** `@axe-core/playwright` (exact-pinned) runs the WCAG 2 AA rules on every main route in both themes. A second spec loads every route at 375 px and asserts `scrollWidth <= clientWidth`. These are the PRD's dark mode and phone metrics turned into tests, and they stay in CI.
- **Unchanged.** Server code, data loading, actions, the database and route structure. Only layout, tokens and presentational components change.

## Patterns to Mirror

| Category       | Source                                                                     | Pattern                                                                                                    |
| -------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Theme tokens   | `src/app/globals.css:7-123`                                                | oklch variables in `:root` and `.dark`, mapped in `@theme inline`; `@custom-variant dark` already in place |
| Fonts          | `src/app/layout.tsx:5-13`, `src/app/globals.css:10`                        | `next/font` variables on `<html>`, `--font-sans: var(--font-geist-sans)`                                   |
| UI primitives  | `src/components/ui/*`, `components.json` (`style: base-nova`, `utils: cn`) | shadcn components on Base UI, added via the CLI, composed with the `render` prop                           |
| Client islands | `src/app/w/[slug]/workspace-switcher.tsx`, `sign-out-button.tsx`           | small `"use client"` components receive plain props from the server layout                                 |
| Role-gated nav | `src/app/w/[slug]/layout.tsx:29-52`                                        | `isStaff` and `role === "owner"` decide which links render                                                 |
| E2E            | `e2e/typography.spec.ts`, `e2e/roles.spec.ts`, `e2e/support/*`             | Playwright on local Supabase, seeded users, `getByRole` with accessible names                              |

## Files to Change

| File                                                                                                                    | Action | Why                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| `package.json`, `pnpm-lock.yaml`                                                                                        | UPDATE | `next-themes`, `@axe-core/playwright` (exact pins)                        |
| `src/app/globals.css`                                                                                                   | UPDATE | zinc and indigo tokens for light and dark, sidebar and chart tokens       |
| `src/app/layout.tsx`                                                                                                    | UPDATE | `ThemeProvider`, `suppressHydrationWarning`                               |
| `src/components/theme-provider.tsx`                                                                                     | CREATE | client wrapper around `next-themes`                                       |
| `src/components/theme-toggle.tsx`                                                                                       | CREATE | Light / Dark / System dropdown labelled "Theme"                           |
| `src/components/ui/sidebar.tsx`, `sheet.tsx`, `tooltip.tsx`, `separator.tsx`, `skeleton.tsx`, `src/hooks/use-mobile.ts` | CREATE | added by `shadcn add sidebar`                                             |
| `src/app/w/[slug]/app-sidebar.tsx`                                                                                      | CREATE | nav with icons, role rules, `aria-current`, switcher, toggle, sign out    |
| `src/app/w/[slug]/layout.tsx`                                                                                           | UPDATE | `SidebarProvider` + `SidebarInset` + mobile top bar instead of the header |
| `src/app/w/[slug]/workspace-switcher.tsx`, `sign-out-button.tsx`                                                        | UPDATE | fit the sidebar header and footer; names and behavior unchanged           |
| `src/app/(auth)/layout.tsx`, `src/app/onboarding/page.tsx`, `src/app/invite/[token]/page.tsx`                           | UPDATE | brand mark and theme toggle on the pages outside a workspace              |
| `e2e/theme.spec.ts`                                                                                                     | CREATE | system default, manual switch, persistence after reload                   |
| `e2e/navigation.spec.ts`                                                                                                | CREATE | `aria-current`, role-based links, mobile sheet navigation                 |
| `e2e/accessibility.spec.ts`                                                                                             | CREATE | axe WCAG 2 AA on main routes in light and dark                            |
| `e2e/mobile-layout.spec.ts`                                                                                             | CREATE | no horizontal scroll at 375 px on every route, as owner and as client     |
| `README.md`                                                                                                             | UPDATE | a line on theming and the new checks                                      |

## Tasks

### Task 1: Theme provider and toggle, tests first

- **Action**: e2e first. With `colorScheme: "dark"` emulated, `<html>` has class `dark`; picking Light in the "Theme" menu removes it and survives a reload; System follows the emulated scheme again. Then add `next-themes`, the provider, and the toggle in the auth layout. It moves into the sidebar in Task 3.
- **Mirror**: client islands with plain props; Base UI `DropdownMenu` as in `workspace-switcher.tsx`.
- **Validate**: `pnpm test:e2e e2e/theme.spec.ts`; no hydration warning in the dev console.

### Task 2: Indigo tokens and contrast checks

- **Action**: add `@axe-core/playwright` and the accessibility spec over login, sign-up, dashboard, clients, projects, a project page, members and billing in both themes. Run it against today's tokens and record what fails. Then replace the neutral tokens with zinc and indigo for light and dark until the spec passes.
- **Mirror**: oklch tokens in `globals.css`; seeded users from `e2e/support`.
- **Validate**: `pnpm test:e2e e2e/accessibility.spec.ts` green in both themes.

### Task 3: Sidebar shell

- **Action**: `navigation.spec.ts` first: the open section has `aria-current="page"`; a client sees Dashboard and Projects only; at 375 px "Open navigation" opens the sheet and a link navigates and closes it. Then `shadcn add sidebar`, `app-sidebar.tsx` and the new workspace layout with the switcher, toggle and "Sign out" in the sidebar.
- **Mirror**: role rules from the current layout; the existing link names (Dashboard, Clients, Projects, Billing, Members) and "Sign out" button stay exactly as they are.
- **Validate**: new spec green and the full existing e2e suite green on the desktop viewport.

### Task 4: Pages outside the workspace

- **Action**: a small brand mark (indigo square plus "Clientdesk") and the theme toggle on sign-in, sign-up, onboarding and invite pages, using the new tokens. No copy or form changes.
- **Validate**: accessibility spec still green; `auth.spec.ts` and `workspace.spec.ts` green.

### Task 5: Phone layout check

- **Action**: `mobile-layout.spec.ts` at 375 px over every route as owner and as client, then fix whatever overflows (wide tables, long names, dialogs).
- **Validate**: `pnpm test:e2e e2e/mobile-layout.spec.ts` green.

### Task 5b: Checks from the ui-ux-pro-max review

- **Action**: the owner asked for a review of the direction with the `ui-ux-pro-max` plugin. It confirmed the minimal style, the indigo accent and a single sans typeface, and its pre-delivery checklist found three gaps. Buttons and other clickable controls show the default arrow cursor, because Tailwind 4 dropped `cursor: pointer` on buttons. On phones the sidebar menu items, the "Open navigation" button and the "Theme" button are smaller than 44 by 44 px. Sheet and dialog animations ignore `prefers-reduced-motion`. Tests first, then fixes through base styles and component classes.
- **Validate**: e2e for pointer cursor, 44 px targets at 375 px, and no animation under emulated reduced motion; full suite green.

### Task 6: Review and a visual pass

- **Action**: react, typescript and code reviewers; `a11y-architect` on the shell and toggle. Screenshots of the dashboard in light and dark at desktop and 375 px for the owner at Gate 2. Lighthouse accessibility on the dashboard, noted for the PRD metric.

## Validation

```bash
pnpm check
pnpm test
pnpm supabase db reset
pnpm test:e2e
pnpm build
```

## Risks

| Risk                                                                                  | Likelihood | Mitigation                                                                                               |
| ------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| React 19 warns about the `<script>` that `next-themes` renders in a client component  | Medium     | Check the dev console in Task 1; if it warns, render the pre-paint script from the server layout instead |
| A new link name collides with an existing one ("Projects") and breaks strict locators | Medium     | Keep one link per name in the shell; the full e2e suite runs after Task 3                                |
| Sidebar component from the CLI does not match Base UI conventions in this repo        | Low        | Read the generated code before use; the CLI style is already `base-nova`                                 |
| axe finds contrast failures inside shadcn primitives                                  | Medium     | Fix through tokens, not per-component overrides                                                          |
| Theme flash on first paint                                                            | Low        | The library's pre-paint script plus `disableTransitionOnChange`                                          |

## Acceptance

- [x] All tasks complete
- [x] Validation passes locally
- [x] Validation passes in CI
- [x] Every main route passes axe WCAG 2 AA in light and dark
- [x] No horizontal scroll at 375 px on any route
- [x] The theme follows the system by default and remembers a manual choice
- [x] Patterns mirrored, not reinvented
