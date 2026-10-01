# Deploying Clientdesk

This guide takes a fresh clone to a live site on Vercel (Hobby) and Supabase Cloud (free plan), with Stripe in test mode and real AI drafts. Steps marked (owner) need an account or a key, so the person who owns those accounts does them. Never paste a key into the repo, an issue or a chat.

Placeholders used below:

- `<ref>`: the Supabase project ref, the 20 lowercase letters in the project URL
- `<host>`: the production host, for example `clientdesk.vercel.app`

## 1. Before you start

- Node 24 and pnpm 12 (`pnpm install` in the repo)
- The Supabase CLI comes with the repo: `pnpm supabase --version` prints 2.118.0
- Stripe CLI 1.52 or later, logged in to a test account (see "Billing" in the README)
- The repo pushed to GitHub

## 2. Supabase project (owner)

1. Create a project on supabase.com. Region: East US (North Virginia), next to Vercel's default function region `iad1`.
2. Save the database password in a password manager. `supabase link` asks for it.
3. From the project's API settings, note three values for later: the project URL, the publishable key and the secret key.

## 3. Schema

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm supabase db push --dry-run
pnpm supabase db push
```

The dry run lists the migrations without applying them. The migrations also create the `project-files` Storage bucket, so there is nothing to click in the Storage settings.

Do not pass `--include-seed`. `supabase/seed.sql` holds test fixtures with a known password, and they must never reach the hosted database.

## 4. Demo template

Every demo sandbox is a copy of the Northwind Studio template, so the hosted database needs the template rows and its 8 files.

The blob script needs the secret key. Typed on the command line it would stay in your shell history, so put two lines in a file named `.env.deploy` (git ignores every `.env*` file):

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=<secret key>
```

Then run:

```bash
pnpm supabase db query --linked -f supabase/demo/template.sql
(set -a; . ./.env.deploy; pnpm demo:blobs)
```

Delete `.env.deploy` afterwards.

The SQL file is safe to run again: it deletes its own rows before inserting them. The blob script takes `SUPABASE_URL`, not `NEXT_PUBLIC_SUPABASE_URL`. Without both variables it uploads to the local stack instead, so check the output names the hosted project. It exits with an error if any upload fails. Afterwards the `project-files` bucket holds 8 objects.

## 5. Auth settings (owner)

`supabase/config.toml` describes the local stack, with `site_url` on `127.0.0.1`. Pushing it with `supabase config push` would write those local values to the hosted project, so set these in the dashboard instead:

1. Authentication, URL Configuration: Site URL is `https://<host>`.
2. Same page, Redirect URLs: add `https://<host>/auth/callback`.
3. Authentication, Sign In / Providers: turn "Confirm email" off. The switch sits above the list of providers, not inside the Email provider, and has its own "Save changes" button. The built-in mailer sends only a few messages per hour, and the project has no mail domain yet.

With confirmation off, anyone can sign up with an address they do not own. That lets someone take an address before its owner does, and an invite link that leaks can be accepted by whoever signs up with the invited address. This is acceptable for a demo. Turn confirmation back on once the project has a mail domain or custom SMTP, and consider CAPTCHA protection for sign-ups in the Supabase Auth settings.

Google sign-in is optional. With the two Google variables left empty, the button stays disabled.

## 6. Stripe (owner)

Use test mode only, with a secret key that starts with `sk_test_`. Demo sandboxes create Stripe customers and the cleanup job deletes them, and nothing in the app checks which mode the key belongs to.

1. Create the product and the price as in "Billing" in the README, and enable the Customer Portal.
2. In the Stripe dashboard, in test mode, add a webhook endpoint for `https://<host>/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
3. Copy the endpoint's signing secret. It is not the one `stripe listen` prints locally.

## 7. Vercel project (owner)

1. Import the GitHub repository on vercel.com. The project name decides the host: `clientdesk` gives `clientdesk.vercel.app` if the name is free.
2. Framework preset: Next.js. Node.js version: 24.x.
3. Leave "Automatically expose System Environment Variables" on. Preview deployments read `VERCEL_ENV` and `VERCEL_BRANCH_URL` from it.
4. Enter the environment variables from the next section before the first deploy.

## 8. Environment variables (owner)

| Variable                               | Value                                | Production | Preview | Without it                                |
| -------------------------------------- | ------------------------------------ | ---------- | ------- | ----------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | `https://<host>`                     | yes        | yes     | The build fails                           |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`          | yes        | yes     | The build fails                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key             | yes        | yes     | The build fails                           |
| `SUPABASE_SECRET_KEY`                  | Supabase secret key                  | yes        | no      | No demo sandboxes, no billing, no cleanup |
| `DEMO_VISITOR_SALT`                    | `openssl rand -hex 32`               | yes        | no      | The demo buttons say the demo is off      |
| `CRON_SECRET`                          | `openssl rand -hex 32`, a second one | yes        | no      | The cleanup route answers 503             |
| `STRIPE_SECRET_KEY`                    | Stripe test secret key               | yes        | no      | "Billing is not configured"               |
| `STRIPE_WEBHOOK_SECRET`                | Signing secret from section 6        | yes        | no      | "Billing is not configured"               |
| `STRIPE_PRO_PRICE_ID`                  | The price id from section 6          | yes        | no      | "Billing is not configured"               |
| `ANTHROPIC_API_KEY`                    | Anthropic API key                    | yes        | no      | "AI drafting is not configured"           |
| `RESEND_API_KEY`                       | Optional                             | optional   | no      | The invite dialog shows a link to copy    |

Preview deployments get only the three `NEXT_PUBLIC_*` values. They build and render, and a pull request's code never holds the secret key for the live database. They do share the production Supabase project through the publishable key, so a sign-up on a preview creates a real account; see section 12.

`NEXT_PUBLIC_*` values are compiled into the build. After changing one, redeploy.

Set a monthly spend limit in the Anthropic console. The app caps drafts at 3 per sandbox and 150 per day across all sandboxes, and the limit in the console is the backstop.

## 9. First deploy (owner)

Deploy. If the host turned out different from the `NEXT_PUBLIC_SITE_URL` you entered, fix the variable, the Supabase URLs from section 5 and the Stripe endpoint from section 6, then redeploy.

## 10. Cron

`vercel.json` schedules `GET /api/cron/cleanup-demo` once a day at 04:00 UTC. On the Hobby plan a cron job runs once a day at most, at some point within the scheduled hour, and only against the production deployment. Vercel sends `CRON_SECRET` as a bearer token.

The job deletes expired sandboxes with their users, files and Stripe test customers. Its daily query also counts as activity on the free Supabase project, which is paused after a week without any.

Check it by hand:

```bash
curl -i https://<host>/api/cron/cleanup-demo
```

This answers 401. With the secret it answers 200 and a JSON object of counts:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/cleanup-demo
```

The job also shows up under Cron Jobs in the Vercel project settings.

## 11. Smoke test

- [ ] The landing page loads
- [ ] "Try as agency" and "Try as client" each land signed in, and the banner switches roles
- [ ] An AI draft is generated in a project
- [ ] A PNG uploads to a project
- [ ] On the Free workspace "Northwind Labs", Upgrade goes through Stripe Checkout with `4242 4242 4242 4242`, and the plan turns to Pro (this proves the webhook)
- [ ] The cron route answers 401 without the secret and 200 with it
- [ ] The page source has an `og:image` URL on `https://<host>`
- [ ] Lighthouse on the landing page, mobile and desktop

## 12. Preview deployments

The live project runs production only: preview deployments are turned off in the Vercel project settings, so a pull request builds nothing and a merge into `main` deploys the site. If you turn previews on, this is how they behave:

- Open Graph and icon URLs use the preview's own branch URL.
- Google sign-in redirects, Stripe return URLs, invite links and links in update emails are built from `NEXT_PUBLIC_SITE_URL`, so on a preview they lead to production.
- Cron jobs do not run on previews.
- The Hobby plan can put preview URLs behind Vercel Authentication (Deployment Protection in the project settings). While it is on, social platforms cannot fetch a preview's image. Keep it on anyway: previews talk to the production database, and the protection keeps strangers off them.

## 13. Troubleshooting

| Symptom                                            | Cause                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| The build stops on "Invalid environment variables" | One of the three `NEXT_PUBLIC_*` values is missing or is not a URL |
| The demo buttons say the live demo isn't available | `DEMO_VISITOR_SALT` or `SUPABASE_SECRET_KEY` is missing            |
| A sandbox opens but its files are broken           | The blob script from section 4 ran against the local stack         |
| The cron route answers 503                         | `CRON_SECRET` or `SUPABASE_SECRET_KEY` is missing                  |
| The cron route answers 401 with the secret         | The header is not exactly `Authorization: Bearer <secret>`         |
| The Stripe webhook answers 400                     | `STRIPE_WEBHOOK_SECRET` belongs to another endpoint                |
| The deploy fails on the cron schedule              | On Hobby the schedule must not run more than once a day            |
