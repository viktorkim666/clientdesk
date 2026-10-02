-- public.claim_ai_draft(p_project_id) and public.ai_draft_requests: the Pro
-- plan gate, the per-user and per-workspace rate limits, the read-your-own
-- RLS policy, and the attack cases (client, other-workspace member, anon,
-- unknown project, direct writes).
--
-- Known gap: claim_ai_draft's per-user advisory lock
-- (pg_advisory_xact_lock, keyed on the user) only serializes concurrent
-- claims within one Postgres session each; pgTAP runs everything in a
-- single session per file, so it can't open two real concurrent
-- transactions to prove the lock actually blocks a second session until
-- the first commits or rolls back. That was checked by hand instead - two
-- psql sessions against the same user racing claim_ai_draft on two
-- different Pro workspaces - see the migration's own comment for the
-- result. What's asserted below is that the function's behavior within a
-- single transaction is unchanged by adding the lock.
BEGIN;
SELECT plan(24);

-- workspace: a0000000-0000-0000-0000-000000000001 (seeded, no billing row -> free)
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

-- Attack: Free workspace refuses the claim with CD002 before any Pro caller
-- ever reaches the rate limit.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'CD002'::char(5),
  'ai_plan_required',
  'a Free workspace refuses the claim with CD002 ai_plan_required'
);

-- Upgrade the seeded workspace to Pro for the rest of the file.
RESET ROLE;
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'cus_test_ai_drafts', 'active');

-- claim_ai_draft's new pg_advisory_xact_lock is reentrant within one
-- session: this whole file runs as a single session inside one BEGIN, so
-- every claim below is really the same session re-taking its own lock.
-- Confirms that doesn't self-deadlock before the sequence of claims that
-- follows relies on it not to.
SELECT lives_ok(
  $$ select pg_advisory_xact_lock(hashtext('claim_ai_draft:00000001-0000-0000-0000-000000000001'));
     select pg_advisory_xact_lock(hashtext('claim_ai_draft:00000001-0000-0000-0000-000000000001')) $$,
  'the same session can re-take its own claim_ai_draft advisory lock without blocking'
);

-- The owner (staff) of a Pro workspace can claim; the RPC returns the new
-- row's id.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'the owner of a Pro workspace claims a draft and gets back a row id'
);

-- A member (staff) of a Pro workspace can claim too.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'a member of a Pro workspace claims a draft and gets back a row id'
);

-- Attack: a client of that workspace is refused.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'only staff can request an AI draft',
  'a client of the workspace cannot claim a draft'
);

-- Attack: a member of another workspace is refused.
RESET ROLE;
INSERT INTO public.workspaces (id, name, slug, created_by) VALUES (
  'b0000000-0000-0000-0000-000000000002', 'Other Co', 'other-co',
  '00000009-0000-0000-0000-000000000009'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, client_id) VALUES (
  'b0000000-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000009', 'owner', NULL
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'only staff can request an AI draft',
  'a member of another workspace cannot claim a draft on this project'
);

-- Attack: an anonymous caller is rejected outright. anon has no EXECUTE on
-- this function (see the revoke_anon_rpc_execute migration), so the
-- privilege check refuses the call before the function's own
-- `auth.uid() is null` guard ever runs; the caller gets Postgres's
-- SQLSTATE 42501, not the function's own 'authentication required'.
SET LOCAL ROLE anon;
RESET request.jwt.claims;
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  '42501',
  NULL,
  'the claim RPC is refused for an anonymous caller at the privilege check (no EXECUTE grant)'
);

-- Attack: an unknown project id is refused, same message as a non-staff
-- caller so the RPC never confirms whether the project exists.
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('00000000-0000-0000-0000-000000000000') $$,
  'only staff can request an AI draft',
  'an unknown project id is refused'
);

-- Rate limit: per-user, 10 per hour. The owner already claimed once above;
-- back-date that row and the two claims made by the member so they don't
-- count toward the owner's or member's window, then insert 9 more fresh
-- claims for the owner as the privileged role to reach the limit without
-- driving the RPC (and its side effects) ten more times.
RESET ROLE;
UPDATE public.ai_draft_requests
  SET created_at = now() - interval '2 hours'
  WHERE user_id = '00000002-0000-0000-0000-000000000002';

SELECT lives_ok(
  $$ insert into public.ai_draft_requests (workspace_id, user_id, project_id)
       select 'a0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001',
              'd0000000-0000-0000-0000-00000000000a'
       from generate_series(1, 8) $$,
  'seeding 8 more owner claims in the last hour as the privileged role'
);

-- The owner now has 9 claims (1 live + 8 seeded) inside the last hour; the
-- 10th through the RPC still succeeds...
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'the owner''s 10th claim within the hour still succeeds'
);

-- ...but the 11th raises CD003 ai_rate_limited.
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'CD003'::char(5),
  'ai_rate_limited',
  'the owner''s 11th claim within the hour raises CD003 ai_rate_limited'
);

-- A claim older than the one-hour window does not count: back-date all of
-- the owner's rows and the 11th claim succeeds again.
RESET ROLE;
UPDATE public.ai_draft_requests
  SET created_at = now() - interval '2 hours'
  WHERE user_id = '00000001-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'a claim older than one hour does not count toward the per-user limit'
);

-- Rate limit: per-workspace, 50 per day. Back-date every row this file has
-- created so far out of both windows, then seed 49 fresh workspace rows,
-- all owned by the owner and backdated past the one-hour window (but not
-- the 24-hour one), so seeding them doesn't also trip the member's
-- per-user hourly limit when the member makes the 50th and 51st claims
-- below through the RPC.
RESET ROLE;
UPDATE public.ai_draft_requests
  SET created_at = now() - interval '25 hours'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';

SELECT lives_ok(
  $$ insert into public.ai_draft_requests (workspace_id, user_id, project_id, created_at)
       select 'a0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001',
              'd0000000-0000-0000-0000-00000000000a', now() - interval '2 hours'
       from generate_series(1, 49) $$,
  'seeding 49 workspace claims in the last day as the privileged role'
);

-- The workspace now has 49 claims inside the last day; the 50th through the
-- RPC (by the member, who has no fresh per-user claims of their own) still
-- succeeds...
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'the workspace''s 50th claim within the day still succeeds'
);

-- ...but the 51st raises CD003 ai_rate_limited, even for a different staff
-- user with plenty of room left on their own per-user limit.
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'CD003'::char(5),
  'ai_rate_limited',
  'the workspace''s 51st claim within the day raises CD003 ai_rate_limited'
);

-- A claim older than the 24-hour window does not count toward the
-- per-workspace limit: back-date every row again and the 51st succeeds.
RESET ROLE;
UPDATE public.ai_draft_requests
  SET created_at = now() - interval '25 hours'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'a claim older than one day does not count toward the per-workspace limit'
);

-- RLS: authenticated users read only their own rows, and cannot write to
-- ai_draft_requests directly at all, even a row that would otherwise be
-- theirs to claim through the RPC.
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests WHERE user_id <> '00000002-0000-0000-0000-000000000002'),
  0,
  'a member can only select their own ai_draft_requests rows'
);

SELECT throws_ok(
  $$ insert into public.ai_draft_requests (workspace_id, user_id, project_id)
       values ('a0000000-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000002',
               'd0000000-0000-0000-0000-00000000000a') $$,
  'new row violates row-level security policy for table "ai_draft_requests"',
  'authenticated cannot insert into ai_draft_requests directly'
);

-- Update and delete: there is no policy for either, so the row is simply
-- not visible to the update/delete planner and the statement affects no
-- rows, the same silent-filter behavior workspace_billing_test proves for
-- its own no-write-policy tables.
UPDATE public.ai_draft_requests SET project_id = 'd0000000-0000-0000-0000-00000000000b'
  WHERE user_id = '00000002-0000-0000-0000-000000000002';
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests
     WHERE user_id = '00000002-0000-0000-0000-000000000002'
       AND project_id = 'd0000000-0000-0000-0000-00000000000b'),
  0,
  'authenticated cannot update ai_draft_requests directly'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
DELETE FROM public.ai_draft_requests WHERE user_id = '00000002-0000-0000-0000-000000000002';
RESET ROLE;
SELECT isnt(
  (SELECT count(*)::int FROM public.ai_draft_requests WHERE user_id = '00000002-0000-0000-0000-000000000002'),
  0,
  'authenticated cannot delete from ai_draft_requests directly'
);

-- Composite FK: a (project_id, workspace_id) pair that doesn't match a real
-- projects row - project A's id paired with the outsider's workspace
-- instead of its own - is rejected, the same guard project_updates,
-- update_comments and project_files all rely on to keep a row's workspace
-- and project in sync.
RESET ROLE;
SELECT throws_ok(
  $$ insert into public.ai_draft_requests (workspace_id, user_id, project_id)
       values ('b0000000-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001',
               'd0000000-0000-0000-0000-00000000000a') $$,
  '23503',
  NULL,
  'a project_id/workspace_id pair that does not match a real project is rejected'
);

-- Deleting a project keeps its draft requests with a null project, so the
-- limits still count them: the rows are the ledger the two limits above
-- count, and a delete must not hand the quota back. Run last in this file,
-- since it removes project A that every earlier test above depends on.
-- Back-date everything out of both windows, then seed 50 workspace claims on
-- project A inside the day but outside the member's hour.
RESET ROLE;
UPDATE public.ai_draft_requests
  SET created_at = now() - interval '25 hours'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ insert into public.ai_draft_requests (workspace_id, user_id, project_id, created_at)
       select 'a0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001',
              'd0000000-0000-0000-0000-00000000000a', now() - interval '2 hours'
       from generate_series(1, 50) $$,
  'seeding 50 workspace claims on project A in the last day'
);
DELETE FROM public.projects WHERE id = 'd0000000-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests
     WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
       AND project_id IS NULL
       AND created_at > now() - interval '24 hours'),
  50,
  'deleting a project keeps its draft requests with a null project, so the limits still count them'
);

-- The workspace limit counts them: the member, with no claims of their own
-- in the last hour, is refused on project B, which still exists.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000b') $$,
  'CD003'::char(5),
  'ai_rate_limited',
  'the workspace limit still counts the draft requests of a deleted project'
);

SELECT * FROM finish();
ROLLBACK;
