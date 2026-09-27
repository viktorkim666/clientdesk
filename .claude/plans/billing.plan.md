# Plan: Billing

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 3. Billing
**Complexity**: Large

## Summary

Add a Free and a Pro plan per workspace, paid through Stripe Checkout, with self-serve management in the Stripe customer portal. Plan state lives in Postgres and is kept in sync by a webhook that re-reads the subscription from Stripe instead of trusting event order. The Free limit of 2 clients is enforced in the database. The milestone is done when an owner upgrades in test mode, the plan flips to Pro, the client limit lifts, and cancelling in the portal brings the workspace back to Free.

## Decisions

- **Plans.** Free: up to 2 clients, no AI. Pro: unlimited clients, AI included (the AI gate itself ships in milestone 4 and reads the same plan helper). One Stripe price, `Pro` monthly, created in the Stripe test account. The amount is a demo value ($19/month) and lives only in Stripe.
- **Who pays.** Only the owner starts checkout or opens the portal. Members see the plan read-only. Clients get a 404 on the billing page.
- **Source of truth.** Stripe. A single `syncWorkspaceBilling(customerId)` function fetches the customer's latest subscription from Stripe and upserts it into `workspace_billing`. The webhook, the checkout success redirect and an owner's "Resync" button all call it. Event order and duplicate deliveries do not matter because every call writes Stripe's current state. This covers the PRD risk "webhooks drift out of sync".
- **Plan rule.** A workspace is Pro while its subscription status is `active`, `trialing` or `past_due` (Stripe is still retrying payment). Any other status, or no subscription, means Free. The rule lives in one SQL helper, `private.workspace_plan(workspace_id)`.
- **Limits.** A `before insert` trigger on `clients` locks the workspace row, counts its clients and raises a named error on Free past 2. The UI shows an upgrade prompt, and the server action maps the error to a readable message. Downgrading keeps existing clients; the workspace just cannot add more until it is back under the limit or upgrades.
- **Writes.** `workspace_billing` has no insert or update policies for `authenticated`. Only server code with the Supabase secret key writes it: the webhook, the sync function and the owner-only checkout action (after it checks the caller's role). The admin client and all Stripe code are `server-only`.
- **Configuration.** Stripe and secret-key variables live in a new server-only env module, not in `src/lib/env.ts`, which is also bundled for the browser. They are optional: without them the billing page says billing is not configured and the buttons are disabled, so CI and local work without Stripe keys still build and pass.
- **Demo and test mode** (PRD open question, resolved for this milestone): billing runs in Stripe test mode only, and the billing page shows a notice with the test card number. Whether demo visitors can reach checkout is decided in milestone 5; nothing here blocks either answer.

## Patterns to Mirror

| Category            | Source                                                  | Pattern                                                                                                |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Server actions      | `src/app/w/[slug]/clients/actions.ts:9-33`              | `"use server"`, Zod on input, `{ ok: true } \| { ok: false; error }`, generic errors, `revalidatePath` |
| Workspace access    | `src/lib/workspace/current.ts`                          | `getCurrentWorkspace(slug)` gives id, name and the caller's role; 404 for non-members                  |
| UI-only permissions | `src/lib/permissions.ts:8-23`                           | small pure functions mirroring RLS, used to hide controls                                              |
| RLS helpers         | `supabase/migrations/20260926174327_init.sql:88-128`    | `security definer` helpers in `private` with `search_path = ''`; policies call only helpers            |
| Triggers            | `supabase/migrations/20260926174327_init.sql:253-290`   | `private.protect_last_owner()` style: `security definer` trigger function raising a named error        |
| Env                 | `src/lib/env.ts`                                        | Zod schema, `optionalString()` for empty values, variables read by name                                |
| Email-style seams   | `src/lib/email/index.ts`                                | a factory picks the real implementation or a disabled fallback from env, so tests inject fakes         |
| pgTAP               | `supabase/tests/09_project_files_test.sql`              | seeded fixed UUIDs, `SET LOCAL ROLE authenticated` + claims, attack cases named in descriptions        |
| Unit tests          | `src/app/w/[slug]/projects/[projectId]/actions.test.ts` | typed Supabase and sender mocks, no casts to `any`                                                     |
| E2E                 | `e2e/workspace.spec.ts`, `e2e/roles.spec.ts`            | full flow through the UI against local Supabase                                                        |

## Data model

- `workspace_billing`: `workspace_id` (pk, fk to workspaces, cascade), `stripe_customer_id` (unique, not null), `stripe_subscription_id`, `subscription_status` (text, null when there is no subscription), `price_id`, `current_period_end` (from the subscription item, per the 2025-03-31 API change), `cancel_at_period_end` (bool), `updated_at`.
- RLS: owner and member select; client and non-member nothing; no insert, update or delete policies.
- `private.workspace_plan(workspace_id) returns text`: `'pro'` or `'free'` per the plan rule.
- `private.enforce_client_limit()` trigger on `clients` before insert.
- Free limit value: a constant in the trigger (2), mirrored by `FREE_CLIENT_LIMIT` in TypeScript for the UI.

## Files to Change

| File                                                                          | Action | Why                                                                                        |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `package.json`                                                                | UPDATE | add `stripe` and `server-only`                                                             |
| `supabase/migrations/*_billing.sql`                                           | CREATE | table, RLS, plan helper, client limit trigger                                              |
| `supabase/seed.sql`                                                           | UPDATE | seeded workspace stays Free; no billing row                                                |
| `supabase/tests/12_workspace_billing_test.sql`, `13_plan_limits_test.sql`     | CREATE | access matrix, plan rule per status, limit on Free, no limit on Pro, downgrade case        |
| `src/types/database.ts`                                                       | UPDATE | regenerated                                                                                |
| `src/lib/env.server.ts` (+ test)                                              | CREATE | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `SUPABASE_SECRET_KEY` |
| `src/lib/supabase/admin.ts`                                                   | CREATE | server-only client with the secret key, used only by billing code                          |
| `src/lib/billing/plan.ts` (+ test)                                            | CREATE | `FREE_CLIENT_LIMIT`, `planFromStatus`, mirroring the SQL rule for the UI                   |
| `src/lib/billing/stripe.ts`                                                   | CREATE | Stripe client factory, `null` when not configured                                          |
| `src/lib/billing/sync.ts` (+ test)                                            | CREATE | `syncWorkspaceBilling(customerId)`                                                         |
| `src/app/api/stripe/webhook/route.ts` (+ test)                                | CREATE | verify signature on the raw body, sync on relevant events                                  |
| `src/app/w/[slug]/settings/billing/page.tsx`, `actions.ts` (+ test), UI parts | CREATE | plan, usage, renewal date; owner actions: upgrade, manage, resync                          |
| `src/app/w/[slug]/clients/actions.ts`, `page.tsx`, `new-client-dialog.tsx`    | UPDATE | map the limit error; show usage and an upgrade prompt on Free                              |
| `src/app/w/[slug]/layout.tsx`                                                 | UPDATE | link to billing for owner and member                                                       |
| `.env.example`, `README.md`                                                   | UPDATE | Stripe test-mode setup, Stripe CLI webhook forwarding                                      |
| `e2e/billing.spec.ts`                                                         | CREATE | Free limit flow; billing page per role                                                     |

## Tasks

### Task 1: Schema, plan rule and limits, tests first

- **Action**: pgTAP first: owner and member read `workspace_billing`, client and outsider see nothing, `authenticated` cannot insert or update it (attack case: a client or member writes `subscription_status = 'active'`). Plan rule for every status. On Free, the third client insert raises; on Pro it succeeds; after a switch back to Free the existing clients stay and the next insert raises. Then the migration.
- **Mirror**: init migration helpers and `protect_last_owner` trigger.
- **Validate**: `pnpm supabase db reset && pnpm supabase test db`, new files red before the migration, green after.

### Task 2: Server-only config and Stripe seam

- **Action**: `env.server.ts` with `import "server-only"` and optional variables; `admin.ts`; `stripe.ts` returning `null` when unconfigured; `plan.ts` mirroring the SQL rule.
- **Validate**: unit tests for env parsing and `planFromStatus`; `pnpm build` passes without Stripe variables.

### Task 3: Sync and webhook

- **Action**: `syncWorkspaceBilling(customerId)` lists the customer's subscriptions (status `all`, newest first), maps status, price and item-level period end, and upserts through the admin client; a customer with no subscription is written as no subscription. The route reads `await request.text()`, verifies with `constructEvent`, returns 400 on a bad signature, calls sync for `checkout.session.completed`, `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed`, returns 200 for other events, and returns 500 when sync fails so Stripe retries.
- **Validate**: unit tests with a signature made by `generateTestHeaderString` and a fake Stripe client: bad signature, unknown event, each handled event, sync failure, a replayed older event that still leaves the current state.

### Task 4: Checkout, portal, resync

- **Action**: owner-only actions. `startCheckout` reuses or creates the customer (idempotency key per workspace, `workspace_id` in metadata), creates a subscription Checkout Session for the Pro price and redirects; an already-Pro workspace goes to the portal instead. `openBillingPortal` redirects to a portal session. `resyncBilling` calls sync. The success URL comes from `NEXT_PUBLIC_SITE_URL` and runs a sync on arrival, so the plan updates even when the webhook is late.
- **Validate**: unit tests: member and client rejected, not configured, customer reused, already Pro, Stripe error returns a generic message.

### Task 5: Billing page and client limit UI

- **Action**: `/w/[slug]/settings/billing`: plan badge, clients used out of the limit, renewal or cancellation date, test-mode notice, owner buttons. Clients page shows usage on Free and an upgrade link at the limit; `createClientCompany` returns "The Free plan allows 2 clients. Upgrade to Pro to add more." for the limit error.
- **Validate**: `e2e/billing.spec.ts`: an owner on Free adds 2 clients, the third is refused with the upgrade prompt; the billing page shows Free 2/2; a member sees it read-only; a client gets 404. CI has no Stripe account, so the webhook and checkout are covered by unit tests here and by the test-mode run in Task 6.

### Task 6: Test-mode run and docs

- **Action**: README and `.env.example`: create the Pro price, enable the customer portal in test mode, forward webhooks with `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Then a manual run in test mode: upgrade with card 4242, see Pro and the lifted limit, cancel in the portal, see Free again. The owner provides the Stripe test keys in `.env.local`; keys are never printed or committed.
- **Validate**: the manual run's steps and results are recorded in the PR description.

### Task 7: Review

- **Action**: full validation, then security, database, React and TypeScript reviewers. Security trigger: payments, webhooks, service-role writes.

## Validation

```bash
pnpm check
pnpm test
pnpm supabase db reset
pnpm supabase test db
pnpm test:e2e
pnpm build
```

## Risks

| Risk                                                        | Likelihood | Mitigation                                                                                                                  |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Out-of-order or duplicate webhook events set the wrong plan | Medium     | every event triggers a full re-read from Stripe; no state is taken from the event payload                                   |
| A non-owner or client reaches the service-role write path   | Medium     | role check in each action before any admin write; unit tests for every other role; RLS has no write policies                |
| Secret keys leak into the browser bundle                    | Low        | separate `server-only` env module; `server-only` import fails the build if a client component pulls it in                   |
| Two concurrent inserts slip past the Free limit             | Low        | the trigger locks the workspace row before counting                                                                         |
| Webhook never reaches localhost in development              | High       | success redirect and the Resync button run the same sync; Stripe CLI forwarding is documented                               |
| Stripe API changes (item-level periods since 2025-03-31)    | Medium     | read periods from subscription items; pin the SDK version                                                                   |
| No Stripe account in CI                                     | High       | Stripe is optional in config; Stripe calls are behind a seam and unit tested; the real flow is the documented test-mode run |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes locally and in CI
- [ ] pgTAP covers the billing access matrix, the plan rule per status and the client limit
- [ ] Test-mode run: upgrade, Pro limits, cancel, back to Free
- [ ] Every route follows the patterns above
