# Plan: Demo and launch

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 5 "Demo and launch", second half. The first half is `.claude/plans/brand-and-polish.plan.md`, merged in viktorkim666/clientdesk#16.
**Complexity**: Large (five pull requests)

## Summary

A visitor on the live site clicks "Try as agency" or "Try as client" and lands in a private copy of Northwind Studio, signed in, with no password shown anywhere. The copy can use real AI drafts, uploads and a Stripe test checkout within hard limits, and it is deleted after 24 hours. The plan also closes the deferred UI nits, deploys to Vercel and Supabase Cloud on free tiers, and publishes a README.

## Decisions

The owner made these on 2026-09-30, before planning:

- **Per-visitor sandbox.** Each click clones the Northwind template into a new workspace with fresh users. Nobody shares state with another visitor, so nobody sees what someone else typed.
- **Sign-in without a published password.** A server action creates the users through the Supabase admin API and signs the visitor in on the server. No password appears in the UI, the README or the repo.
- **24-hour lifetime.** A daily cron deletes expired sandboxes with their users, Storage blobs and Stripe test customers. The same cron keeps the free Supabase project from pausing.
- **AI.** Real Claude calls, 3 drafts per sandbox and a global daily budget across all sandboxes. Past either limit the visitor gets an honest message and a saved sample draft.
- **Billing.** The sandbox workspace starts on Pro. Its billing page says so and links to a second, Free workspace in the same sandbox, where the visitor can run a real Stripe test-mode Checkout with a test card.
- **Uploads.** Allowed in the sandbox with hard limits: 5 new files, 2 MB each, images and PDF only. They are deleted with the sandbox.
- **Hosting.** Vercel (Hobby) and Supabase Cloud (free). The owner creates the accounts and enters every key; this plan ships a step-by-step guide.
- **Domain.** `clientdesk.vercel.app`, or the closest free name.
- **Video.** Dropped by the owner on 2026-10-01: the live demo shows the product, so the README links to it and carries two screenshots.
- **UI nits before deploy.** A collapsed "Reply" for comments, a landing mobile menu, a label for the comment delete button, and no workspace switcher for a client with one workspace.

Technical decisions this plan adds (open to change at Gate 1):

- **The template is the Northwind workspace itself.** Its SQL moves out of `supabase/seed.sql` into `supabase/demo/template.sql` and runs on both the local and the hosted database. Template users get no password and cannot sign in. Their timestamps are fixed, and cloning re-anchors them to `now()`, so a fresh sandbox always shows "14 updates this week".
- **Cloning happens in one SQL function**, `public.create_demo_sandbox`, callable only by `service_role`. It copies the workspace, clients, projects, updates, comments and file rows under new UUIDs, adds the Free workspace, writes a pinned Pro billing row without a Stripe customer, and records the sandbox in `public.demo_sandboxes`. The server action creates the four users first (owner, member, two clients), passes their ids in, then copies the 8 template blobs in Storage.
- **Sign-in** uses `auth.admin.generateLink({ type: "magiclink" })` and `verifyOtp({ token_hash })` on the server client, which sets the session cookies. No email goes out.
- **Role switch.** A thin banner inside a sandbox says who you are ("Viewing as Maya, agency owner") and offers "Switch to client view" (and back). It signs in as the other sandbox user through the same server-side path.
- **Abuse limits.** `create_demo_sandbox` refuses above a global cap (40 new sandboxes per hour, 300 live). The server action also keeps 3 sandboxes per hour per visitor, keyed by a salted hash of the first `x-forwarded-for` address. The raw IP is never stored.
- **No outgoing mail from a sandbox.** Sandbox users get addresses on `demo.clientdesk.invalid`. The email layer drops any recipient on that domain, and inviting people is disabled inside a sandbox, with a note that explains why. The template's `.test` addresses go away.
- **Account changes.** The app has no password or email settings screen. A sandbox user could still call `auth.updateUser` directly with their token. That only affects a throwaway user that is deleted within 24 hours, so this plan accepts it and does not add a hook.
- **The deferred milestone 4 debt** closes in the cron: it deletes `ai_draft_requests` older than 7 days.
- **Open Graph on previews.** `metadataBase` uses `VERCEL_BRANCH_URL` when `VERCEL_ENV` is `preview`, and `NEXT_PUBLIC_SITE_URL` otherwise.

Decided by the owner at Gate 1 (2026-09-30):

- **Email on the live site.** Resend can only mail the account owner until a domain is verified, and the project has no custom domain. Supabase's built-in mailer allows a few messages per hour. So the hosted project turns off email confirmation, and when no email sender is configured the invite dialog shows the invite link for the owner to copy (Task A4). A domain for Resend can come later.

## Pull requests

| PR  | Branch              | Contents                                                                   |
| --- | ------------------- | -------------------------------------------------------------------------- |
| A   | `feat/demo-sandbox` | Plan, template split, sandbox creation, sign-in, role switch, cleanup cron |
| B   | `feat/demo-limits`  | AI budget and sample, upload limits, billing note and Free workspace       |
| C   | `fix/ui-nits`       | The four deferred UI nits                                                  |
| D   | `feat/deploy`       | Vercel config, preview `metadataBase`, deploy guide, live smoke test       |
| E   | `docs/readme`       | README rewrite, two screenshots, plan and PRD closed                       |

Each PR goes through `orch-add-feature` (C through `orch-fix-defect` or `orch-change-feature`, whichever fits each nit), its own Gate 2 and green CI before the next one starts. The plan file and the ticked acceptance box in `brand-and-polish.plan.md` are the first commit of PR A.

## Patterns to Mirror

| Category        | Source                                                | Pattern                                                                                                       |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Server actions  | `src/app/(auth)/actions.ts:19`                        | `"use server"`, zod parse, `{ ok: false, error }` state for form errors, `redirect()` on success              |
| Admin client    | `src/lib/supabase/admin.ts:17`                        | `createAdminClient()` returns `null` without `SUPABASE_SECRET_KEY`; callers report "not configured"           |
| Server env      | `src/lib/env.server.ts:5`                             | Optional keys through `optionalString()`, parsed once, exported as `serverEnv`                                |
| RPC with limits | `supabase/migrations/20260927143617_ai_drafts.sql:54` | `security definer`, `search_path = ''`, row lock plus advisory lock, custom `CDxxx` errcodes, explicit grants |
| Plan checks     | `supabase/migrations/20260927123710_billing.sql:64`   | `private.workspace_plan()` derives the plan from `workspace_billing.subscription_status`                      |
| Seed fixture    | `supabase/seed.sql:143`                               | Own UUID prefix, a comment saying who depends on the rows and why                                             |
| Test doubles    | `src/lib/billing/sync.ts:39`                          | Narrow interfaces for external clients so tests pass plain objects, no casts                                  |
| Unit tests      | `src/app/w/[slug]/settings/billing/actions.test.ts`   | Vitest next to the file, module mocks for Supabase and `next/navigation`                                      |
| pgTAP           | `supabase/tests/14_ai_draft_requests_test.sql`        | JWT claims per test user, fixed fixture UUIDs, one file per feature                                           |
| e2e             | `e2e/support/global-setup.ts`, `e2e/support/auth.ts`  | Serial, own dev server on :3100, cleanup through `supabase db query --local`, exact-name locators             |

## Files to Change

| File                                                                                 | Action         | Why                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `supabase/seed.sql`                                                                  | UPDATE         | Remove the Northwind block; test fixtures stay as they are                                                       |
| `supabase/demo/template.sql`                                                         | CREATE         | Northwind template: passwordless users with `auth.identities`, fixed timestamps, idempotent (delete then insert) |
| `supabase/demo/files/*`                                                              | CREATE         | 8 small PNG and PDF blobs for the template file rows                                                             |
| `supabase/config.toml`                                                               | UPDATE (owner) | Add `./demo/template.sql` to `[db.seed] sql_paths`. Protected file: the owner pastes this line                   |
| `supabase/migrations/2026093010xxxx_demo_sandboxes.sql`                              | CREATE         | `demo_sandboxes` table, `create_demo_sandbox`, `delete_expired_demo_sandboxes`, `private.is_demo_workspace`      |
| `supabase/migrations/20261001100000_demo_ai_limits.sql`                              | CREATE (PR B)  | AI budget limit on `claim_ai_draft`, demo_ai_usage ledger, CD004 errors                                          |
| `supabase/migrations/20261001110000_demo_upload_limits.sql`                          | CREATE (PR B)  | Upload count and type limits, demo_upload_usage ledger, CD005 errors, storage policy cap                         |
| `supabase/tests/23_demo_hardening_test.sql` through `26_demo_usage_cleanup_test.sql` | CREATE         | Demo user guards, AI limits, upload limits, usage ledgers and cleanup                                            |
| `scripts/demo/upload-template-blobs.mts`                                             | CREATE         | Uploads the template blobs to Storage, locally and on the hosted project                                         |
| `src/lib/demo/*`                                                                     | CREATE         | Sandbox creation, sign-in, role switch, visitor hash, user factory                                               |
| `src/app/demo/actions.ts`                                                            | CREATE         | `startDemo(role)` and `switchDemoRole()` server actions                                                          |
| `src/components/demo-banner.tsx`                                                     | CREATE         | "Viewing as ..." banner with the role switch                                                                     |
| `src/components/landing/hero.tsx`, `final-cta.tsx`, `site-header.tsx`                | UPDATE         | "Try as agency" and "Try as client" buttons                                                                      |
| `src/app/w/[slug]/layout.tsx`                                                        | UPDATE         | Render the banner in a sandbox                                                                                   |
| `src/app/api/cron/cleanup-demo/route.ts`                                             | CREATE         | Bearer `CRON_SECRET`, deletes expired sandboxes, users, blobs, Stripe customers, old draft requests              |
| `src/lib/email/index.ts`                                                             | UPDATE         | Drop recipients on the demo domain                                                                               |
| `src/app/w/[slug]/settings/members/*`                                                | UPDATE         | Invites disabled in a sandbox; copyable link when no sender (if the owner picks that)                            |
| `src/lib/ai/*`, `draft-update/route.ts`, draft UI                                    | UPDATE (PR B)  | New `ai_demo_budget` error, saved sample draft                                                                   |
| `src/lib/validation/file.ts`, `file-uploader.tsx`                                    | UPDATE (PR B)  | Demo limits checked before upload, with clear messages                                                           |
| `src/app/w/[slug]/settings/billing/page.tsx`                                         | UPDATE (PR B)  | Sandbox note with a link to the Free workspace                                                                   |
| `comment-row.tsx`, `comment-form.tsx`, `site-header.tsx`, `workspace-switcher.tsx`   | UPDATE (PR C)  | UI nits                                                                                                          |
| `vercel.json`                                                                        | CREATE (PR D)  | Daily cron for `/api/cron/cleanup-demo`                                                                          |
| `src/app/layout.tsx`, `src/lib/env.ts`, `env.server.ts`, `.env.example`              | UPDATE         | Preview `metadataBase`; `CRON_SECRET`, `DEMO_VISITOR_SALT`                                                       |
| `docs/deploy.md`                                                                     | CREATE (PR D)  | Step-by-step for the owner: Supabase Cloud, Vercel, Stripe webhook, env vars, template upload                    |
| `README.md`                                                                          | UPDATE         | Live demo link, screenshots, deploy notes, updated demo section                                                  |
| `playwright.config.ts`, `e2e/support/*`                                              | UPDATE         | e2e gets the local secret key so the demo buttons work; Stripe keys stay empty                                   |
| `e2e/demo-sandbox.spec.ts`, `demo-limits.spec.ts`                                    | CREATE         | Both buttons, role switch, isolation, limits                                                                     |
| `e2e/demo-data.spec.ts`, `visual-polish.spec.ts`, `destructive-contrast.spec.ts`     | UPDATE         | Enter Northwind through the demo button instead of `password123`                                                 |
| `.claude/plans/brand-and-polish.plan.md`                                             | UPDATE         | Tick "Validation passes locally and in CI"                                                                       |
| `.claude/prds/clientdesk.prd.md`                                                     | UPDATE         | Row 5 points at this plan (2 of 2); `complete` after PR E                                                        |

## Tasks

### PR A: sandbox

#### Task A1: Template split

- **Action**: Move the Northwind block from `seed.sql` to `supabase/demo/template.sql`. Users lose their passwords, gain `auth.identities` rows, and move to `demo.clientdesk.invalid` addresses. Timestamps become fixed offsets from a stored anchor. The file deletes its own rows first, so running it twice leaves one copy. Add the 8 blobs and the upload script. The owner adds the path to `config.toml`.
- **Mirror**: `supabase/seed.sql:143` comments and UUID prefix 3.
- **Validate**: `supabase db reset` twice, then `pnpm db:test` and `pnpm demo:blobs`; counts match the old block.

#### Task A2: Sandbox schema and clone function

- **Action**: Migration with `demo_sandboxes` (workspace ids, the four user ids, visitor hash, `expires_at`), `private.is_demo_workspace()`, `create_demo_sandbox(...)` and `delete_expired_demo_sandboxes()`, both granted to `service_role` only. Clone re-anchors timestamps, pins Pro with no Stripe customer, creates the Free workspace, enforces the global caps with a named errcode.
- **Mirror**: `claim_ai_draft` locking, errcodes and grants.
- **Validate**: pgTAP: a clone has 5 clients, 10 projects, 18 updates, 10 comments, 8 files; a sandbox user sees nothing outside their sandbox; `anon` and `authenticated` cannot execute either function; the cap refuses.

#### Task A3: Start and switch

- **Action**: `startDemo(role)` hashes the visitor, checks the per-visitor limit, creates four users through the admin API, calls the clone function, copies blobs, then signs in with `generateLink` and `verifyOtp` and redirects to the dashboard (agency) or the first project (client). If any step fails it deletes what it created and shows "The demo is busy, try again in a minute". `switchDemoRole()` signs in as the other sandbox user. Landing buttons and the banner call these actions.
- **Mirror**: `src/app/(auth)/actions.ts`, `createAdminClient` null handling.
- **Validate**: unit tests with narrow admin-client doubles; e2e: both buttons land signed in, the banner switches roles, two sandboxes don't see each other's comments.

#### Task A4: Mail and invites in a sandbox

- **Action**: The email layer drops demo-domain recipients. The members page disables inviting in a sandbox and explains why. Outside a sandbox, when no email sender is configured, the invite dialog shows the invite link with a copy button instead of failing.
- **Validate**: unit tests on the sender and the members action; e2e checks the disabled invite.

#### Task A5: Cleanup cron

- **Action**: `GET /api/cron/cleanup-demo` checks `Authorization: Bearer ${CRON_SECRET}`, calls `delete_expired_demo_sandboxes()`, deletes the returned users and blobs, deletes Stripe test customers when Stripe is configured, and removes `ai_draft_requests` older than 7 days. Returns counts as JSON.
- **Validate**: route unit tests (401 without the secret, counts with it); pgTAP for the expiry function.

#### Task A6: Tests and docs for PR A

- **Action**: Move the three e2e specs that used `password123` to the demo button. Update the README demo section. Security review is mandatory: auth, admin key, rate limits.

### PR B: limits

#### Task B1: AI budget

- **Action**: In a demo workspace `claim_ai_draft` allows 3 drafts per sandbox and a global daily budget (default 150 per day across all sandboxes). Both limits count a demo_ai_usage ledger with no foreign keys (deleted rows do not free slots). The function raises `ai_demo_limit` for sandbox limit and `ai_demo_budget` for global budget, both CD004. The route maps it to a 429 with a flag, and the draft UI shows a message with a saved sample draft the visitor can still edit and publish. Migration: `20261001100000_demo_ai_limits.sql`.
- **Validate**: pgTAP 24_demo_ai_limits_test.sql for both limits; route and UI unit tests; e2e/demo-limits.spec.ts with the fake generator.

#### Task B2: Upload limits

- **Action**: A `before insert` trigger `enforce_demo_upload_limits` on `project_files` in a demo workspace refuses a sixth new file, anything over 2 MB, or a type other than image or PDF (CD005). The trigger counts a demo_upload_usage ledger with no foreign keys, so deleting a file frees no slot. Five CD005 messages: demo_upload_count_limit, demo_upload_size_limit, demo_upload_type_limit, demo_upload_object_missing, demo_upload_path_invalid. The trigger answers only members of the workspace; for anyone else row level security gives its usual error. The uploader checks the same rules first and shows the limit in the drop zone hint. A Storage insert policy (volatile, under a per-workspace advisory lock) caps the object count under a sandbox prefix, accepts only canonical paths and refuses a name a file row already uses, so a direct upload without a file row is bounded and a registered object cannot be swapped. Accepted residual risk: direct uploads to Storage that are never registered are not counted in the 5; the object cap, 10 MiB per object and the 24-hour sandbox life bound them. The type limit trusts the Content-Type Storage recorded. Migration: `20261001110000_demo_upload_limits.sql`.
- **Validate**: pgTAP 25_demo_upload_limits_test.sql for trigger and policy; uploader unit tests; e2e/demo-limits.spec.ts uploads a PNG and sees a refused 3 MB file.

#### Task B3: Billing in a sandbox

- **Action**: The Pro sandbox billing page says "This demo workspace is on Pro, so every feature is unlocked" and links to the Free workspace called "Northwind Labs". On the Free workspace Upgrade runs the normal Stripe Checkout in test mode; the page shows the test card number `4242 4242 4242 4242` as help text. Helper RPC `get_sandbox_billing(p_workspace_id)` returns which half of the sandbox this workspace is. Billing sync and the webhook ignore the pinned billing row because it has no customer.
- **Validate**: e2e/demo-billing.spec.ts and manual run against Stripe test mode with the owner's keys.

### PR C: UI nits

- **C1**: Comments show a "Reply" button that expands the form.
- **C2**: The landing header gets a mobile menu (sheet) below `sm`.
- **C3**: The comment delete button gets an accessible name ("Delete comment by {name}").
- **C4**: A client with one workspace sees the workspace name without a switcher.
- **Validate**: unit tests per component, axe e2e in both themes, 375 px screenshots in the visual QA pass (ui-ux-pro-max checklist).

### PR D: deploy

#### Task D1: Config

- **Action**: `vercel.json` with one daily cron. Preview `metadataBase`. `CRON_SECRET` and `DEMO_VISITOR_SALT` in the env schemas and `.env.example`.
- **Validate**: unit tests on the metadata base helper; `pnpm build`.

#### Task D2: Deploy guide and first deploy

- **Action**: `docs/deploy.md`: create the Supabase project, `supabase link` and `supabase db push`, run the template SQL and blob script, set auth settings, create the Vercel project from GitHub, enter env vars, add the Stripe webhook for the production URL, check the cron. The owner does every step that involves an account or a key. I give the commands and check the result.
- **Validate**: live smoke test: landing loads, both demo buttons work, a real AI draft, an upload, a Stripe test checkout on the Free workspace, the cron endpoint answers 401 without the secret. Lighthouse on the landing.

### PR E: README

#### Task E1: README

- **Action**: Live demo link at the top, two screenshots from the live site, the stack, architecture notes (RLS, sandbox, limits), local setup, deploy link, tests. Humanizer on all of it.
- **Validate**: owner review; links checked.

## Validation

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm build
supabase db reset && pnpm db:test
pnpm test:e2e
```

Plus the live smoke test in D2.

## Risks

| Risk                                                                                            | Likelihood | Mitigation                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bots create sandboxes in a loop and fill the free database                                      | Medium     | Per-visitor and global caps in two places, 24-hour cleanup, the cap error names no internals                                 |
| Free Supabase pauses after a week without traffic                                               | Medium     | The daily cron hits the database                                                                                             |
| Vercel Hobby cron runs only once a day, at an imprecise time                                    | Certain    | Sandboxes live "about a day"; expiry is checked on every cron run, and a sandbox past `expires_at` stops accepting sign-ins  |
| Admin user creation plus blob copies make the first click slow                                  | Medium     | Measure; show a pending state on the button; copy blobs in parallel                                                          |
| Giving e2e the local secret key turns billing "configured"                                      | Low        | `isBillingConfigured` also needs Stripe keys, which stay empty; `billing.spec.ts` proves it                                  |
| Storage cannot check object size in an insert policy                                            | High       | Bucket limit (10 MiB) plus the file-row trigger plus the object count cap; a stray blob dies with the sandbox                |
| Supabase built-in mail rate limit blocks real signups on the live site                          | High       | Email confirmation off on the hosted project; copyable invite link (Task A4)                                                 |
| Anthropic spend                                                                                 | Low        | 3 per sandbox, global daily budget, Haiku 4.5, console spend limit set by the owner                                          |
| `generateLink` sign-in flow differs from what I expect in the installed `@supabase/supabase-js` | Medium     | Check context7 and the installed types before Task A3; fall back to a one-time random password that is never stored or shown |
| The protected `config.toml` needs a line for the template seed                                  | Certain    | The owner pastes it; Task A1 waits for it                                                                                    |

## Acceptance

- [x] A visitor tries both roles in one click on the live site, with no password visible anywhere
- [x] Two sandboxes never see each other's data (pgTAP and e2e)
- [x] AI, upload and sandbox limits hold, with honest messages
- [ ] Expired sandboxes, their users, blobs and Stripe customers are deleted by the cron
- [x] Deferred UI nits closed and checked in both themes at 1440 and 375
- [x] Live on Vercel and Supabase Cloud; the deploy guide works from a clean start
- [x] README published
- [x] Validation passes locally and in CI for every PR
- [x] Patterns mirrored, not reinvented
