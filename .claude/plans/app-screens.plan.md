# Plan: App screens

**Source PRD**: `.claude/prds/clientdesk-design.prd.md`
**Selected Milestone**: 2. App screens
**Complexity**: Large

## Summary

The workspace screens get finished content in the indigo direction from milestone 1. The dashboard shows metrics, a project list and a recent activity feed. Projects, clients, members and billing get page headers, status badges, avatars and proper empty states. The project page gets a clearer header, an update feed with avatars and a file list with type icons. Every list has an empty state with a next action, and every route has a skeleton while it loads. Behavior, schema and server actions stay as they are. The one addition is read-only queries for the dashboard, and row-level security already scopes them.

## Decisions

- **Dashboard (mockup variant 2, picked by the owner).**
  - Metric cards:
    - "Active projects" as `N of M`;
    - "Clients", staff only;
    - "Updates this week".
  - "Projects": the 5 newest, each with its client and a status badge, plus a link to all projects.
  - "Recent activity": the latest 8 events across the workspace, merged from `project_updates`, `update_comments` and `project_files`. Each event has an author avatar, a verb, the project link and a relative time.
  - The queries read the `workspace_id` columns. Their indexes already exist, and RLS (`private.can_read_project`) limits a client to their own projects.
  - All reads start together through `Promise.all`, following `clients/page.test.ts`.
- **Status badges.** One `StatusBadge` component uses color, an icon and text, so no state is shown by color alone:
  - Active: success tone, `CircleDot`;
  - On hold: warning tone, `CirclePause`;
  - Done: neutral, `CircleCheck`.

  New `--success` and `--warning` tokens (each with a foreground) are added for light and dark and must pass AA. The plan badge (Free/Pro) and the role badges use the same component family.

- **Labels in sentence case.** Statuses read "Active", "On hold", "Done" and roles read "Owner", "Member", "Client" everywhere, including select options. One `statusLabel` and one `roleLabel` helper replace the inline `replace("_", " ")` calls. The e2e selectors that match the old lowercase text exactly get the new label. That is an intentional copy change, not a looser assertion.
- **Shared page parts.**
  - `PageHeader`: h1, a one-line description, an actions slot.
  - `EmptyState`: icon tile, title, one-line body, action. It is built on the shadcn `empty` component.
  - `UserAvatar`: initials on the pale indigo tint, based on the shadcn `avatar`. It replaces the local `initials()` in `nav-user.tsx`.
  - The shadcn `avatar`, `empty`, `progress` and `textarea` components are added through the CLI. The hand-styled textareas move to `Textarea`, keeping their labels and placeholders.
- **Project page.**
  - Header:
    - back link, the project name as h1;
    - meta line with the client name and `Created <date>`;
    - status on the right (the `StatusControl` select for staff, `StatusBadge` for the client).
  - Updates: avatar, author, relative time in `<time dateTime>` with the absolute date in `title`, body, and comments indented under a left rule.
  - Files: a type icon from `mime_type` (image, PDF, archive, generic), the name, uploader, size and upload date. Adding `mime_type, created_at` to the existing select is not a new query.
- **Clients.**
  - Columns: name with avatar, project count, added date.
  - The project count comes from an embedded `projects(count)` in the existing select.
  - On the Free plan, a usage bar shows "N / 2 clients used." (text unchanged).
- **Members.**
  - Members table: avatar and name, role badge or role select, client.
  - Invitations: email, role badge, and an expiry shown as "Expires in N days" or "Expired". This is presentation only, computed from `expires_at`.
- **Billing.**
  - Plan card: the plan badge ("Free" stays a unique exact text match), a client-usage `Progress`, what the plan includes, and the renewal or cancel date.
  - A secondary card holds the Stripe test-card note.
- **Loading and errors.**
  - `loading.tsx` skeletons for the dashboard, projects, clients, the project page, members and billing. Each has `role="status"` and a sr-only label, and matches its page layout so nothing jumps.
  - `error.tsx` gets the same `EmptyState` shape with the danger tone.
- **Dates.** A `formatRelative` helper built on `Intl.RelativeTimeFormat`, with a fixed `now` passed in for tests. Absolute dates use one `formatDate` helper with a fixed `en-US` locale, so server and client render the same text.
- **Unchanged.** Server actions, API routes, migrations, RLS and route structure. Accessible names stay as listed in the code-explorer inventory unless a line above changes them.

## Patterns to Mirror

| Category        | Source                                                   | Pattern                                                                                     |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Page data       | `src/app/w/[slug]/clients/page.tsx`                      | server component, `createClient` + `getCurrentWorkspace`, inline Supabase reads in parallel |
| Page unit tests | `src/app/w/[slug]/clients/page.test.ts`                  | `vi.hoisted` mocks for Supabase and workspace, deferred promises to prove parallel reads    |
| Loading tests   | `src/app/w/[slug]/settings/billing/loading.test.ts`      | `renderToStaticMarkup`, assert `role="status"`                                              |
| Pure helpers    | `src/lib/billing/plan.ts`, `src/lib/sidebar-cookie.ts`   | small typed functions with a colocated `*.test.ts`                                          |
| UI primitives   | `src/components/ui/*`, `components.json` (`base-nova`)   | shadcn via the CLI, Base UI `render` prop, `cn`                                             |
| Theme tokens    | `src/app/globals.css`                                    | oklch pairs in `:root` and `.dark`, mapped in `@theme inline`                               |
| E2E             | `e2e/accessibility.spec.ts`, `e2e/mobile-layout.spec.ts` | seeded users via `e2e/support/auth.ts`, axe in both themes, 375 px scroll check             |

## Files to Change

| File                                                                                                                                      | Action        | Why                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `src/components/ui/avatar.tsx`, `empty.tsx`, `progress.tsx`, `textarea.tsx`                                                               | CREATE        | shadcn CLI                                                             |
| `src/app/globals.css`                                                                                                                     | UPDATE        | `success` and `warning` tokens for light and dark                      |
| `src/lib/format.ts` (+ test)                                                                                                              | CREATE        | `statusLabel`, `roleLabel`, `formatDate`, `formatRelative`, `fileKind` |
| `src/lib/activity.ts` (+ test)                                                                                                            | CREATE        | merge updates, comments and files into one sorted, capped feed         |
| `src/components/status-badge.tsx`, `role-badge.tsx`, `user-avatar.tsx`, `page-header.tsx`, `empty-state.tsx` (+ tests where logic exists) | CREATE        | shared page parts                                                      |
| `src/app/w/[slug]/page.tsx` (+ test), `loading.tsx` (+ test), `error.tsx`                                                                 | UPDATE        | dashboard, workspace skeleton, error state                             |
| `src/app/w/[slug]/projects/page.tsx`, `new-project-dialog.tsx`, `loading.tsx`                                                             | UPDATE/CREATE | header, badges, empty state, labels, skeleton                          |
| `src/app/w/[slug]/projects/[projectId]/*`                                                                                                 | UPDATE        | header, feed, comments, files, `Textarea`, skeleton                    |
| `src/app/w/[slug]/clients/page.tsx` (+ test), `loading.tsx`                                                                               | UPDATE/CREATE | columns, usage bar, empty state, skeleton                              |
| `src/app/w/[slug]/settings/members/*`, `loading.tsx`                                                                                      | UPDATE/CREATE | avatars, role badges and labels, expiry, empty state                   |
| `src/app/w/[slug]/settings/billing/*`                                                                                                     | UPDATE        | plan card, progress, skeleton                                          |
| `src/app/w/[slug]/nav-user.tsx`                                                                                                           | UPDATE        | use `UserAvatar`                                                       |
| `e2e/dashboard.spec.ts`                                                                                                                   | CREATE        | metrics, activity after an update, client scoping, empty workspace     |
| `e2e/empty-states.spec.ts`                                                                                                                | CREATE        | every list in a fresh workspace explains itself and offers an action   |
| `e2e/accessibility.spec.ts`, `e2e/mobile-layout.spec.ts`                                                                                  | UPDATE        | cover the empty workspace and the project page with content            |
| e2e specs that match lowercase status or role text exactly                                                                                | UPDATE        | new sentence-case labels                                               |
| `README.md`                                                                                                                               | UPDATE        | a line on the dashboard and the new checks                             |

## Tasks

### Task 1: Tokens, helpers and shared parts

- **Action**:
  - Unit tests first:
    - `statusLabel` and `roleLabel` for every enum value;
    - `formatRelative` at the minute, hour, day and week boundaries with a fixed `now`;
    - `fileKind` for image, PDF, zip and unknown types;
    - `StatusBadge` renders its text and icon for each status.
  - Then add the four shadcn components and the success and warning tokens (contrast checked in both themes).
  - Then build `StatusBadge`, `RoleBadge`, `UserAvatar`, `PageHeader` and `EmptyState`.
- **Mirror**: `src/lib/sidebar-cookie.test.ts`, `components.json`.
- **Validate**: `pnpm test src/lib/format.test.ts src/components`; `pnpm typecheck`.

### Task 2: Dashboard

- **Action**:
  - Unit tests first:
    - `buildActivityFeed` merges the three sources newest first, caps at 8, names a missing author "Former member", and keeps the project name and id.
    - The page starts all reads together.
    - The page hides the Clients metric for a client.
  - Then the page and `loading.tsx`.
  - E2E: a staff user posts an update and sees it at the top of Recent activity. A client does not see another client's project in the list or the feed. A fresh workspace shows the "Start your first project" empty state with a working action.
- **Mirror**: `clients/page.test.ts`, `billing/loading.test.ts`.
- **Validate**: `pnpm test src/lib/activity.test.ts 'src/app/w/[slug]/page.test.ts'`; `pnpm test:e2e e2e/dashboard.spec.ts`.

### Task 3: Projects and clients

- **Action**:
  - Page headers with descriptions.
  - `StatusBadge` in the projects table.
  - Avatar and project count on clients.
  - The Free usage bar.
  - `EmptyState` with the dialog trigger as its action for staff, and explanatory text for a client.
  - Sentence-case options in the new-project dialog.
  - Skeletons.
  - Update the exact-text e2e selectors for status labels.
- **Mirror**: current `new-client-dialog.tsx` and `new-project-dialog.tsx` triggers (names "New client" and "New project" kept).
- **Validate**: `pnpm test 'src/app/w/[slug]/clients'`; `pnpm test:e2e e2e/workspace.spec.ts e2e/projects.spec.ts e2e/billing.spec.ts`.

### Task 4: Project page

- **Action**:
  - Header with meta and status.
  - The update feed with `UserAvatar` and relative `<time>`.
  - Comments indented.
  - `Textarea` in both forms, keeping the labels, placeholders and button names ("Post update", "Draft update", "Comment").
  - The file table with type icons and date.
  - Empty states for updates and files.
  - A skeleton replacing "Loading project…".
- **Mirror**: `updates-list.tsx`, `file-list.tsx` structure; `draft-client.test.ts` must stay green.
- **Validate**: `pnpm test:e2e e2e/projects.spec.ts e2e/ai-draft.spec.ts e2e/files*.spec.ts`.

### Task 5: Members and billing

- **Action**:
  - Members:
    - avatars;
    - `RoleBadge` where the role is read-only;
    - sentence-case role options in `member-row` and `invite-member-dialog`;
    - invitation expiry text;
    - "No pending invitations" as an `EmptyState` with the Invite action.
  - Billing:
    - the plan card with `Progress` and plan contents;
    - a separate test-mode card;
    - the skeleton keeps `role="status"`.
  - Update the exact role selectors in e2e.
- **Mirror**: `member-row.tsx` permission checks unchanged; `billing/page.test.ts` stays green.
- **Validate**: `pnpm test 'src/app/w/[slug]/settings'`; `pnpm test:e2e e2e/roles.spec.ts e2e/billing.spec.ts e2e/member-row*.spec.ts`.

### Task 6: Coverage, visual QA and docs

- **Action**:
  - `e2e/empty-states.spec.ts`.
  - Extend the axe and 375 px specs to the empty workspace and a project page with updates, comments and files, in both themes.
  - A visual QA pass over every screen as owner and as client, in light and dark, at 1280 and 375 px, against the ui-ux-pro-max pre-delivery checklist. Fix what looks unfinished.
  - README line.
- **Validate**: full validation below.

### Task 7: Reviews

- **Action**:
  - Reviewers:
    - `react-reviewer`, `typescript-reviewer` and `code-reviewer`;
    - `a11y-architect` for the badges, feed, avatars, skeletons and empty states;
    - `security-reviewer` for the new dashboard reads (RLS scoping, no data from other projects).
  - Fix every CRITICAL, HIGH and MEDIUM finding.
- **Validate**: reviewers report no open CRITICAL, HIGH or MEDIUM findings.

## Validation

```bash
pnpm check
pnpm test
pnpm supabase db reset
pnpm test:db
pnpm test:e2e
pnpm build
```

## Risks

| Risk                                                                                 | Likelihood | Mitigation                                                                                           |
| ------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------- |
| Restyle breaks e2e locators (substring collisions like "Comment", the unique "Free") | Medium     | Keep the inventory's names; run the affected specs after each task; new text avoids those substrings |
| Activity feed leaks another client's events                                          | Low        | RLS already filters every source; an e2e test signs in as a second client and checks the feed        |
| Relative times differ between server and client render                               | Medium     | Render relative time on the server only, pass a fixed `now`, and put the absolute date in `title`    |
| Success and warning badges fail contrast in dark mode                                | Medium     | Pick tokens against AA before use; axe in both themes covers every badge                             |
| Dashboard gets slow with many events                                                 | Low        | Each source is capped at 8 rows on an indexed `workspace_id`; counts use `head: true`                |
| Scope creep into new features                                                        | Medium     | Only presentation plus read-only queries; anything else goes to milestone 5                          |

## Acceptance

- [x] All tasks complete
- [x] Every list screen explains itself when empty and offers the next action
- [x] Every workspace route shows a skeleton while loading
- [x] Status is never shown by color alone
- [x] Axe WCAG 2 AA passes in both themes, including empty states and a filled project page
- [x] No horizontal scroll at 375 px on any route
- [x] Visual QA pass done in both themes at 1280 and 375 px
- [x] Validation passes locally
- [x] Validation passes in CI
- [x] Patterns mirrored, not reinvented

## Follow-ups

Moved to milestone 5 of the main PRD by the owner on 2026-09-29:

- Seed realistic demo data: named agencies and clients, 6 to 8 projects and a week of activity. With the current test seed ("Client A Inc.", "Olivia Owner") the screens read as a test setup.
- Company avatars show initials ("CI" for "Client A Inc."). A building icon may read better.
- On a phone the dashboard shows the workspace name twice, once in the top bar and once in the page heading.
- With only 2 projects the dashboard's left column looks empty next to the activity feed. Check this again once the demo data exists.
