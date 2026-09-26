# Plan: Workspaces and roles

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 1. Workspaces and roles
**Complexity**: Large (it also bootstraps the repository)

## Summary
Set up the repository, tooling and CI, then build sign-up, workspaces, clients, a minimal project list, and invitations for members and clients. Access control lives in Postgres row-level security, and pgTAP tests prove it for every role. The milestone is done when a client invited to a workspace sees only their own projects, in the database and in the UI.

## Patterns to Mirror
This is a greenfield repository with no existing code, so there is nothing to mirror. The conventions below come from current official docs and become the patterns for later milestones.

| Category | Source | Pattern |
|---|---|---|
| Auth session | `@supabase/ssr` docs (context7 `/supabase/ssr`) | `createServerClient` with cookie `getAll`/`setAll`, a fresh client per request, `auth.getClaims()` for server-side checks. `getSession()` is never trusted on the server |
| Request interception | Next.js 16 upgrade guide (context7 `/vercel/next.js/v16.2.9`) | `proxy.ts` exporting `proxy()` with a `matcher`; `middleware.ts` is deprecated |
| DB tests | Supabase CLI docs (context7 `/supabase/cli`) | pgTAP files in `supabase/tests`, run with `supabase test db`; each file runs in a rolled-back transaction |
| Naming | this plan | kebab-case files, `snake_case` SQL, one migration per change, server actions in `actions.ts` next to the route |
| Errors | this plan | Server actions return `{ ok: true, data } \| { ok: false, error }` and never throw to the client; unexpected errors are logged on the server with the action name |
| Tests | this plan | Vitest unit tests next to the code (`*.test.ts`), Playwright specs in `e2e/`, pgTAP in `supabase/tests/` |

## Stack decisions
| Area | Choice | Why |
|---|---|---|
| Package manager | pnpm 12 | installed locally, fast CI cache |
| Framework | Next.js 16.3, React 19.3, TypeScript strict | current stable; App Router with Server Actions |
| UI | Tailwind 4.3 + shadcn/ui | what SaaS clients expect to see; accessible primitives |
| Validation | Zod 4 | shared schemas for forms, actions and env |
| Backend | Supabase (Auth, Postgres, RLS), local stack through Supabase CLI + Docker | matches the PRD; local stack gives reproducible tests |
| Email | Resend in production, a console sender locally and in tests | invitations must not need a verified domain to develop |
| Unit tests | Vitest 5 | fast, TS native |
| E2E | Playwright 1.63 against the local Supabase stack | proves the role flow end to end |
| CI | GitHub Actions: lint, typecheck, unit, `supabase start` + `supabase test db`, e2e | every milestone ships with green CI |
| Hosting | Vercel + Supabase Cloud, set up in milestone 5 | not needed to finish this milestone |

## Data model (this milestone)
- `profiles`: `id` (= `auth.users.id`), `full_name`, `avatar_url`. A trigger creates it on sign-up.
- `workspaces`: `id`, `name`, `slug` (unique), `created_by`, `created_at`.
- `clients`: `id`, `workspace_id`, `name`, `created_at`. This is the agency's customer company.
- `workspace_members`: `workspace_id`, `user_id`, `role` (`owner` \| `member` \| `client`), `client_id` (required when role is `client`, null otherwise), `created_at`. Primary key `(workspace_id, user_id)`.
- `projects`: `id`, `workspace_id`, `client_id`, `name`, `status` (`active` \| `on_hold` \| `done`), `created_at`. Minimal for now; milestone 2 extends it.
- `invitations`: `id`, `workspace_id`, `email`, `role`, `client_id`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`.

Access helpers are `security definer` SQL functions in a `private` schema that the API does not expose: `private.member_role(workspace_id)` and `private.member_client_id(workspace_id)`. Policies call these helpers, so a `workspace_members` policy never queries `workspace_members` itself and cannot recurse.

| Table | owner | member | client | non-member |
|---|---|---|---|---|
| workspaces | read, update | read | read | nothing |
| workspace_members | read all, change role, remove | read all | read staff and self | nothing |
| clients | full | full | read own client row | nothing |
| projects | full | full | read projects of own client | nothing |
| invitations | invite anyone, revoke | invite clients only | nothing | nothing |

Workspace creation and invitation acceptance go through two RPCs, so their multi-row writes are atomic and never need broad insert policies:
- `create_workspace(name)` inserts the workspace and the owner membership in one transaction.
- `accept_invitation(token)` checks the token hash, expiry, and that the invited email matches the signed-in user's email, then inserts the membership and marks the invitation accepted.

## Files to Change
| File | Action | Why |
|---|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `postcss.config.mjs` | CREATE | scaffold and tooling |
| `components.json`, `src/components/ui/*` | CREATE | shadcn/ui setup and the primitives this milestone uses |
| `src/lib/env.ts` | CREATE | Zod-validated environment variables |
| `src/lib/supabase/server.ts`, `client.ts`, `proxy.ts` | CREATE | Supabase clients for server, browser and proxy |
| `src/proxy.ts` | CREATE | refresh the session; redirect signed-out users away from `/w/*` |
| `src/lib/email/*` | CREATE | `sendInvitationEmail` with Resend and console implementations |
| `src/lib/invitations/token.ts` | CREATE | token generation and SHA-256 hashing |
| `src/lib/validation/*.ts` | CREATE | Zod schemas for sign-up, workspace, client, project, invite |
| `src/app/(auth)/login`, `signup`, `src/app/auth/callback/route.ts` | CREATE | email and password auth, Google OAuth, code exchange |
| `src/app/onboarding/*` | CREATE | first workspace creation |
| `src/app/w/[slug]/layout.tsx`, `page.tsx` | CREATE | workspace shell, workspace switcher, basic dashboard |
| `src/app/w/[slug]/clients/*`, `projects/*` | CREATE | list and create clients and projects (staff); the client role sees its projects |
| `src/app/w/[slug]/settings/members/*` | CREATE | member list, invite form, role change, removal |
| `src/app/invite/[token]/*` | CREATE | accept an invitation after sign-in or sign-up |
| `supabase/config.toml` | CREATE | local stack; email confirmation off locally; Google provider read from env |
| `supabase/migrations/*_init.sql` | CREATE | tables, enums, helpers, RLS, RPCs, profile trigger |
| `supabase/seed.sql` | CREATE | local dev data: one workspace, two clients, users for each role |
| `supabase/tests/*.sql` | CREATE | pgTAP tests for the access matrix and RPCs |
| `src/types/database.ts` | CREATE | generated with `supabase gen types` |
| `e2e/roles.spec.ts`, `playwright.config.ts`, `vitest.config.ts` | CREATE | tests |
| `.github/workflows/ci.yml` | CREATE | CI pipeline |
| `.env.example`, `README.md` (short, setup only) | CREATE | local setup; the full README comes in milestone 5 |
| `.claude/prds/clientdesk.prd.md` | UPDATE | milestone 1 to in-progress, link this plan |

## Tasks
### Task 1: Scaffold and tooling
- **Action**: `git init`; create the Next.js 16 app with TypeScript strict, Tailwind 4, ESLint and Prettier; add shadcn/ui, Zod, Vitest and Playwright; add scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:test`, `db:types`.
- **Mirror**: Next.js 16 defaults; no custom build config.
- **Validate**: `pnpm lint && pnpm typecheck && pnpm build`

### Task 2: Local Supabase and the schema
- **Action**: `supabase init`; write the init migration (tables, enums, `private` helpers, RLS on every table, the two RPCs, the profile trigger); write the seed; generate types.
- **Mirror**: access matrix above; policies only call `private.*` helpers.
- **Validate**: `supabase start && supabase db reset && pnpm db:types`

### Task 3: pgTAP tests for access control, written before the UI
- **Action**: one test file per table plus one for the RPCs. For each role, assert what it can read and write, using `set local role authenticated` and JWT claims for seeded users. Cover the attack cases: client A reading client B's projects, a member promoting themselves to owner, a member inviting another member, a non-member reading anything, accepting an invitation with the wrong email, and reusing or accepting an expired token.
- **Mirror**: Supabase CLI pgTAP layout.
- **Validate**: `supabase test db` all green; temporarily dropping one policy locally makes the matching test fail

### Task 4: Supabase clients, proxy, env
- **Action**: server and browser clients per `@supabase/ssr` docs; `proxy.ts` refreshes the session and guards `/w/*`; Zod env module that fails the build on missing variables.
- **Mirror**: `@supabase/ssr` cookie `getAll`/`setAll`; `getClaims()` on the server.
- **Validate**: `pnpm typecheck`; unit test for the env schema

### Task 5: Auth screens
- **Action**: sign up and log in with email and password; Google OAuth button; `auth/callback` route that exchanges the code; sign out. Redirect after login: to `/onboarding` without a workspace, to `/w/[slug]` otherwise, or back to `/invite/[token]` when that is where the user came from.
- **Mirror**: server action result shape.
- **Validate**: Playwright sign-up and login spec. Google OAuth is checked by hand once credentials exist.

### Task 6: Workspaces, clients, projects
- **Action**: onboarding form calling `create_workspace`; workspace layout and switcher; client list and create form; project list and create form (staff only) with client and status. The client role sees a read-only list of its projects.
- **Mirror**: Zod schemas shared by form and action; RLS does the filtering, the UI only hides controls.
- **Validate**: Vitest for schemas and slug generation; Playwright staff flow

### Task 7: Invitations and members
- **Action**: invite form (owner invites any role; member invites clients only; a client invite must pick a client); store only the token hash; send the email through the sender interface; members page with role change and removal for the owner; `/invite/[token]` page that calls `accept_invitation` after sign-in or sign-up. The last owner cannot be removed or demoted.
- **Mirror**: RPC for acceptance; `token.ts` for hashing.
- **Validate**: Vitest for token and permission helpers; pgTAP for the RPC; Playwright spec below

### Task 8: End-to-end role check and CI
- **Action**: Playwright spec: owner signs up, creates a workspace, two clients and a project for each, invites a client user for client A; the invitee signs up from the link, accepts, and sees only client A's project; opening client B's project URL directly returns not found. Add the GitHub Actions workflow running lint, typecheck, unit, `supabase test db` and e2e.
- **Validate**: `pnpm test:e2e` locally; CI green on the first push

## Validation
```bash
pnpm lint
pnpm typecheck
pnpm test
supabase start
supabase db reset
supabase test db
pnpm test:e2e
pnpm build
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS policies on `workspace_members` recurse or leak | Medium | policies only call `security definer` helpers in `private`; pgTAP attack cases written before the UI |
| `@supabase/ssr` and Next.js 16 `proxy.ts` behave differently from older examples | Medium | follow the current docs pulled through context7; e2e covers session refresh |
| Google OAuth needs a Google Cloud client ID and secret from the user | High | email and password work without it; Google is wired but enabled only when the variables exist |
| Invitation email needs a verified sending domain on Resend | Medium | console sender locally and in CI; production sending is set up in milestone 5 |
| Docker-based local Supabase is slow in CI | Low | cache the images; run `supabase start` once per job |
| Scope creep from the milestone 2 project page | Medium | projects here have only name, client and status |

## Open questions carried from the PRD
Demo data reset, AI spend caps, demo billing access and upload limits belong to milestones 2 to 5 and are not decided here.

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes locally and in CI
- [ ] pgTAP covers every cell of the access matrix and the listed attack cases
- [ ] A client user sees only their own client's projects in the database and in the UI
- [ ] Every route follows the patterns above
