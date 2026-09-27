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

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test              # unit tests (Vitest)
pnpm supabase db reset # reapply migrations + seed
pnpm supabase test db  # pgTAP tests (access control, RPCs)
pnpm test:e2e          # Playwright, requires the app and Supabase running
pnpm build
```
