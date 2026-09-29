# Clientdesk

A client portal for small agencies: workspaces, roles, per-client project visibility, and billing.

## Setup

Prerequisites: Node 24, pnpm 12, Docker (for the local Supabase stack).

```bash
pnpm install
pnpm supabase start        # starts the local Supabase stack in Docker
cp .env.example .env.local # NEXT_PUBLIC_SITE_URL defaults to localhost:3000; fill the
                            # Supabase values from `pnpm supabase status`
pnpm dev                   # http://localhost:3000
```

## Billing (Stripe test mode)

Billing is optional. Without `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` and `SUPABASE_SECRET_KEY`, the billing page shows "Billing is not configured" and CI runs without them.

### Setup

Install Stripe CLI 1.52 or later. Log in to your Stripe test account:

```bash
stripe login
```

Create the Pro product and price:

```bash
stripe products create --name "Clientdesk Pro"
stripe prices create --product <prod_id> --unit-amount 1900 --currency usd -d "recurring[interval]=month"
```

Enable the Customer Portal in the Stripe sandbox: Settings → Billing → Customer portal, allow cancellations.

Get your keys:

```bash
pnpm supabase status          # copy SECRET_KEY to SUPABASE_SECRET_KEY
stripe listen --print-secret  # copy to STRIPE_WEBHOOK_SECRET
```

Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` and `SUPABASE_SECRET_KEY` to `.env.local`.

### Webhook forwarding

Forward Stripe events to your local server (required for testing):

```bash
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed --forward-to localhost:3000/api/stripe/webhook
```

### Test mode

Use card `4242 4242 4242 4242`, any future expiry, any CVC.

Plan state: Stripe is the source of truth. The webhook, the post-checkout redirect and the owner's Resync button all re-read the subscription from Stripe. Free allows 2 clients (enforced in the database). Pro is active, trialing or past_due.

To end a test subscription immediately:

```bash
stripe subscriptions cancel <sub_id> --confirm
```

## Dashboard, empty and loading states

The workspace dashboard shows active projects, clients and updates from the last 7 days, the five newest projects and a feed of recent updates, comments and file uploads. Every read goes through RLS, so a client only sees their own projects and the activity on them. Lists without data show an empty state that says what goes there and links to the next step (for example, "Add a client first" on Projects). Each route under a workspace has a loading skeleton that matches its layout.

## AI update draft

Staff on a Pro workspace can click "Draft update" on a project page. The server collects the project's activity from the last 7 days (updates, comments and file names), asks Claude for a short client update and streams the text into the update form. The staff member edits it and posts it like any other update. Free workspaces see an upgrade prompt instead.

Drafts use `claude-haiku-4-5-20251001` with `max_tokens` 800. `claim_ai_draft` in Postgres allows 10 drafts per user per hour and 50 per workspace per 24 hours. The input is capped at 50 items or 12,000 characters, whichever comes first, to keep the cost of one request bounded.

`ANTHROPIC_API_KEY` is optional. Locally and in CI, an empty key switches to a fake generator that streams a template draft. In production, an empty key disables the button with "AI drafting is not configured".

### Setup

To try drafting with the real Claude API:

1. Create an API key in the Anthropic Console and add it to `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-...
```

2. Restart the dev server.

`pnpm test:e2e` always uses the fake generator: it starts its own dev server on port 3100 with `ANTHROPIC_API_KEY` and the Stripe keys forced empty, regardless of what's in `.env.local` or whether a dev server is already running on port 3000.

### Local testing

The seed creates a Pro workspace for this feature: `ai-draft-pro-agency`, owner `ai-draft-owner@clientdesk.test`, password `password123`. Sign in, open a project with recent activity and click "Draft update" in the Updates card.

Each run of `e2e/ai-draft.spec.ts` counts against that workspace's limit of 50 drafts per 24 hours, but Playwright's global setup clears that workspace's `ai_draft_requests` rows before the suite runs, so reruns can't exhaust the limit.

## Theming

The app supports light, dark and system (the default). Inside a workspace, pick a theme from the Account menu at the bottom of the sidebar. Outside a workspace (sign-in, sign-up, onboarding, invite), use the Theme button at the top of the page. The choice is stored in `localStorage` and survives a reload; on system, it follows the OS/browser color scheme.

Color tokens live in `src/app/globals.css` as CSS custom properties (`--background`, `--sidebar`, `--ring`, and so on), each with a light and a dark value. Spacing uses Tailwind's default scale, not custom tokens. New UI should read the color tokens through the Tailwind classes already in use (`bg-background`, `text-foreground`, etc.) rather than hardcoding colors.

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test              # unit tests (Vitest)
pnpm supabase db reset # reapply migrations + seed
pnpm db:test           # pgTAP tests (access control, RPCs)
pnpm test:e2e          # Playwright, requires Supabase running; starts its own dev server on port 3100
pnpm build
```

`pnpm test:e2e` also covers:

- accessibility: axe against WCAG 2 A/AA plus landmark and heading rules (a single top-level `<main>`, one `<h1>`, unique landmarks) on every main route, in both light and dark
- empty states: a new workspace's dashboard, projects, clients, members and project page each explain themselves and offer the next action
- accessibility and 375px layout of the empty screens, a filled project page and the populated dashboard
- layout at a 375px viewport: no horizontal scroll, dialogs fit the viewport, touch targets are at least 44x44
- interaction polish: pointer cursor on enabled controls, no animation under `prefers-reduced-motion`
