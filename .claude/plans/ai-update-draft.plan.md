# Plan: AI update draft

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 4. AI update draft
**Complexity**: Large

## Summary

Staff on a Pro workspace click "Draft update" on a project page. The server collects the last 7 days of that project's activity, asks Claude for a short client update, and streams the text into the existing update form, where the member edits it and posts it through the unchanged `postUpdate` action (so the client email still goes out). Free workspaces see an upgrade prompt, and every request passes a database-backed rate limit before any tokens are spent.

## Decisions

- **Model.** `claude-haiku-4-5-20251001` (cheaper and faster for a public demo; the owner chose it at Gate 1) through `@anthropic-ai/sdk` (0.128.0, exact-pinned), `max_tokens` 800. The model ID is a constant in one file; changing it is a one-line diff.
- **Transport.** A Route Handler, `POST /api/projects/[projectId]/draft-update`, returns a `text/plain` `ReadableStream` built from `client.messages.stream(...)` `text` events. A Server Action cannot stream token by token into a textarea as simply, and the route keeps the Anthropic call off the page render. The client reads it with `response.body.getReader()` and appends to the textarea. The request carries an `AbortSignal`; closing the page aborts the Claude call.
- **Nothing is saved automatically.** The draft lives only in the textarea. Publishing is the existing "Post update" button, so a draft never reaches the client without a person reading it.
- **Who can draft.** Owner and member of a Pro workspace. Clients get 404 from the route (same as the project page); Free gets 402 with an upgrade message, and the button shows "Pro" with a link to billing instead of generating.
- **Activity window.** Updates, comments (with author names) and file names from the last 7 days, plus the project's current status and client name. Capped at 50 items and 12,000 characters, newest first, so one busy project can't run up the input cost. With no activity the route returns 422 "Nothing happened on this project in the last 7 days" and never calls Claude.
- **Prompt injection.** Activity text is user content. It goes into the user turn inside `<activity>` tags; the system prompt says to treat it as data and write only the update. The output is plain text shown in a textarea and never rendered as HTML, and a person reviews it before posting, so the worst case is a strange draft.
- **Rate limit and demo spend** (PRD open question, resolved for this milestone). A table `ai_draft_requests (id, workspace_id, user_id, project_id, created_at)` and a `security definer` RPC `claim_ai_draft(p_project_id)` that, in one transaction with the workspace row locked: checks the caller is staff of the project's workspace, checks `private.workspace_plan = 'pro'`, counts the caller's requests in the last hour (limit 10) and the workspace's in the last 24 hours (limit 50), then inserts a row. It raises `CD002 ai_plan_required` or `CD003 ai_rate_limited`, mapped to 402 and 429 like `CD001` is mapped today. A failed Claude call still counts, which is the safer side for spend. The public demo's global daily budget, and whether demo visitors share these counters, belong to milestone 5; this milestone gives it the table to count from.
- **Configuration.** `ANTHROPIC_API_KEY` is optional in `env.server.ts`. Without it, and outside production, a fake generator streams a fixed draft built from the activity (mirrors the console email sender), so local work and CI run the whole flow without a key. In production without a key the button reads "AI drafting is not configured" (mirrors billing).

## Patterns to Mirror

| Category                 | Source                                                                                  | Pattern                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Server env               | `src/lib/env.server.ts:5-40`                                                            | `server-only`, `optionalString()`, variables read by name, `parseServerEnv` exported for tests              |
| Swappable external seam  | `src/lib/email/index.ts:14-20`, `types.ts`                                              | interface + real impl + local fake; factory picks by whether the key is set                                 |
| Route Handler            | `src/app/api/stripe/webhook/route.ts`                                                   | explicit status codes (400/413/500/503), no stack traces in responses, `console.error` with a route prefix  |
| Plan gate and SQL errors | `supabase/migrations/20260927123710_billing.sql:64-128`, `clients/actions.ts`           | `private.workspace_plan`, row lock, custom SQLSTATE raised in SQL and matched on `error.code` in TypeScript |
| Plan in the UI           | `src/lib/billing/plan.ts:18-22`, `clients/page.tsx`                                     | `planFromStatus` for display; the database is the enforcement point                                         |
| Server actions / forms   | `src/app/w/[slug]/projects/[projectId]/actions.ts:62-175`, `update-form.tsx`            | `postUpdate` unchanged; the form becomes controlled so the draft can fill it                                |
| RLS helpers              | `supabase/migrations/20260926212619_projects_content.sql`                               | `private.is_staff`, `private.can_read_project`, `search_path = ''`                                          |
| pgTAP                    | `supabase/tests/13_plan_limits_test.sql`, `11_update_recipients_test.sql`               | seeded UUIDs, `SET LOCAL ROLE authenticated` with `request.jwt.claims`, attack cases named in descriptions  |
| Unit tests               | `src/lib/billing/sync.test.ts`, `src/app/w/[slug]/projects/[projectId]/actions.test.ts` | Vitest next to the code, narrow interfaces instead of casts for fakes                                       |
| E2E                      | `e2e/billing.spec.ts`, `e2e/projects.spec.ts`                                           | full flow on local Supabase; billing variables empty in CI                                                  |

## Files to Change

| File                                                                                                 | Action | Why                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `supabase/migrations/*_ai_drafts.sql`                                                                | CREATE | `ai_draft_requests`, RLS (select own, no write policies), `claim_ai_draft` RPC, indexes |
| `supabase/tests/14_ai_draft_requests_test.sql`                                                       | CREATE | access matrix, plan gate, both limits, attack cases                                     |
| `src/types/database.ts`                                                                              | UPDATE | regenerated and prettier-formatted                                                      |
| `package.json`, `pnpm-lock.yaml`                                                                     | UPDATE | `@anthropic-ai/sdk` exact-pinned                                                        |
| `src/lib/env.server.ts` (+ test)                                                                     | UPDATE | optional `ANTHROPIC_API_KEY`                                                            |
| `src/lib/ai/activity.ts` (+ test)                                                                    | CREATE | load and cap the 7-day activity; format it for the prompt                               |
| `src/lib/ai/prompt.ts` (+ test)                                                                      | CREATE | system prompt and user turn                                                             |
| `src/lib/ai/draft-generator.ts`, `anthropic-generator.ts`, `fake-generator.ts`, `index.ts` (+ tests) | CREATE | `DraftGenerator` seam returning `AsyncIterable<string>`; factory by key and environment |
| `src/app/api/projects/[projectId]/draft-update/route.ts` (+ test)                                    | CREATE | auth, claim, activity, stream; status codes 401/402/404/422/429/503/500                 |
| `src/app/w/[slug]/projects/[projectId]/update-form.tsx`                                              | UPDATE | "Draft update" button, streamed text into a controlled textarea, stop button, errors    |
| `src/app/w/[slug]/projects/[projectId]/page.tsx`                                                     | UPDATE | pass plan and "AI configured" to the form                                               |
| `e2e/ai-draft.spec.ts`                                                                               | CREATE | Pro staff drafts, edits and posts; Free sees upgrade; client has no button              |
| `.env.example`, `README.md`                                                                          | UPDATE | key and AI section                                                                      |

## Tasks

### Task 1: Schema, RPC and rate limit, tests first

- **Action**: pgTAP first, then the migration. Cases: member of a Pro workspace claims; Free raises `CD002`; the 11th claim in an hour raises `CD003`; the 51st per workspace per day raises `CD003`; a client of that workspace, a member of another workspace and an anonymous caller are refused; a user cannot insert into or read other users' rows of `ai_draft_requests` directly.
- **Mirror**: `enforce_client_limit` (lock, custom SQLSTATE), `project_update_recipients` (staff check in a `security definer` RPC).
- **Validate**: `pnpm supabase db reset && pnpm supabase test db`.

### Task 2: SDK, env and the generator seam

- **Action**: add `@anthropic-ai/sdk@0.128.0`; `ANTHROPIC_API_KEY` in `env.server.ts`; `DraftGenerator` with the Anthropic implementation (streams `text` deltas, forwards the `AbortSignal`) and the fake; factory `getDraftGenerator()` that returns `null` in production without a key.
- **Mirror**: `getEmailSender`, `isBillingConfigured`.
- **Validate**: `pnpm test` with a fake Anthropic client: deltas come through in order, abort stops the stream, SDK errors surface as one typed error.

### Task 3: Activity and prompt

- **Action**: `loadProjectActivity(supabase, projectId, since)` through the RLS client; caps of 50 items and 12,000 characters; `buildDraftPrompt(activity)`.
- **Validate**: unit tests for the caps, the empty case, the 7-day boundary and that activity text stays inside the `<activity>` block.

### Task 4: Streaming route

- **Action**: `POST /api/projects/[projectId]/draft-update`: getClaims (401), validate the UUID, `claim_ai_draft` (404 / 402 / 429 by SQLSTATE), no generator (503), load activity (422 if empty), then stream. Errors after the first byte end the stream and are logged; errors before it return 500 with a generic message.
- **Mirror**: the Stripe webhook route's status handling.
- **Validate**: route unit tests with fake Supabase and generator for every status code.

### Task 5: Draft button in the update form

- **Action**: textarea becomes controlled; "Draft update" streams into it, disabled while posting; "Stop" aborts; errors show in the existing `role="alert"` line; Free shows a Pro badge linking to billing; not configured shows a disabled button with a hint.
- **Validate**: e2e below and the React reviewer.

### Task 6: End to end, docs and a real run

- **Action**: `e2e/ai-draft.spec.ts` with the fake generator; README section and `.env.example`; then one manual run with a real key that the owner puts into `.env.local` themselves.
- **Validate**: full validation below.

### Task 7: Review

- **Action**: security, database, React, TypeScript and code reviewers; all HIGH and MEDIUM findings fixed before Gate 2.

## Validation

```bash
pnpm check
pnpm test
pnpm supabase db reset
pnpm supabase test db
ANTHROPIC_API_KEY= STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_PRO_PRICE_ID= SUPABASE_SECRET_KEY= pnpm test:e2e
pnpm build
```

## Risks

| Risk                                         | Likelihood | Mitigation                                                                                          |
| -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| AI spend on the public demo                  | Medium     | per-user and per-workspace limits in SQL, `max_tokens` 800, input cap; global budget in milestone 5 |
| Prompt injection through updates or comments | Medium     | activity passed as tagged data, plain-text output, a person posts it                                |
| The fake generator reaching production       | Low        | factory returns `null` when `NODE_ENV === "production"` and no key; unit test covers it             |
| Stream cut mid-way leaves half a draft       | Medium     | the form keeps what arrived and shows "Draft stopped"; nothing is saved automatically               |
| Rate-limit race between two tabs             | Low        | the RPC locks the workspace row before counting                                                     |
| Model ID or SDK API changes                  | Low        | exact pin, model constant in one file, SDK checked against context7 for 0.128                       |

## Acceptance

- [x] All tasks complete
- [x] Validation passes locally and in CI
- [x] A Pro member drafts, edits and posts an update, and the client gets the email
- [x] Free, client, other-workspace and over-limit callers are refused before Claude is called
- [x] Patterns mirrored, not reinvented

Ticked on 2026-09-29 from the merge record of PR viktorkim666/clientdesk#6, including the manual run with a real key, merged after green CI. The checks were not re-run for this note.
