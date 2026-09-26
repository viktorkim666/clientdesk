# Clientdesk

A client portal for small agencies: workspaces, roles, and per-client project visibility.

## Setup

Prerequisites: Node 24, pnpm 12, Docker (for the local Supabase stack).

```bash
pnpm install
pnpm supabase start        # starts the local Supabase stack in Docker
cp .env.example .env.local # NEXT_PUBLIC_SITE_URL defaults to localhost:3000; fill the
                            # Supabase values from `pnpm supabase status`
pnpm dev                   # http://localhost:3000
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
