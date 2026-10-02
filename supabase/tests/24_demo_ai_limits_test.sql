-- claim_ai_draft inside a demo sandbox: 3 drafts per sandbox (no time window)
-- and a global budget of 150 drafts per rolling 24 hours across all sandboxes,
-- both refused with errcode CD004 (message ai_demo_limit for the sandbox's own
-- limit, ai_demo_budget for the global one). A workspace outside
-- a sandbox keeps only the per-user and per-workspace limits.
--
-- Both limits count the demo_ai_usage ledger, which has no foreign keys, so
-- deleting a project, a client or a whole sandbox does not give anything back.
BEGIN;
SELECT plan(27);

-- non-demo Pro workspace: a0000000-0000-0000-0000-000000000001 (seeded)
--   project d0000000-0000-0000-0000-00000000000a, owner 00000001-...01
-- sandbox A (one Pro workspace):  workspace a6000000-...0a, owner 61000000-...0a, project d6000000-...0a
-- sandbox B (global budget test): workspace a6000000-...0b, owner 61000000-...0b, project d6000000-...0b
-- sandbox C (Pro + a Pro "free" workspace): workspaces a6000000-...0c and ...0d,
--   owner 61000000-...0c, projects d6000000-...0c and ...0d
-- sandbox D (fills the global budget): workspace a6000000-...0e, owner 61000000-...0e, project d6000000-...0e

-- Rows left behind by e2e runs or by hand would count toward the budget.
DELETE FROM public.ai_draft_requests;
DELETE FROM public.demo_ai_usage;
DELETE FROM public.demo_sandboxes;

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000000',
  format('61000000-0000-0000-0000-00000000000%s', s)::uuid,
  'authenticated', 'authenticated',
  format('ai-limits-%s@demo.clientdesk.invalid', s),
  '{}', '{}', now(), now()
FROM unnest(array['a', 'b', 'c', 'e']) AS s;

INSERT INTO public.workspaces (id, name, slug)
SELECT format('a6000000-0000-0000-0000-00000000000%s', s)::uuid, 'AI limits ' || s, 'ai-limits-' || s
FROM unnest(array['a', 'b', 'c', 'd', 'e']) AS s;

INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
SELECT format('a6000000-0000-0000-0000-00000000000%s', s)::uuid, NULL, 'active'
FROM unnest(array['a', 'b', 'c', 'd', 'e']) AS s;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES
  ('a6000000-0000-0000-0000-00000000000a', '61000000-0000-0000-0000-00000000000a', 'owner'),
  ('a6000000-0000-0000-0000-00000000000b', '61000000-0000-0000-0000-00000000000b', 'owner'),
  ('a6000000-0000-0000-0000-00000000000c', '61000000-0000-0000-0000-00000000000c', 'owner'),
  ('a6000000-0000-0000-0000-00000000000d', '61000000-0000-0000-0000-00000000000c', 'owner'),
  ('a6000000-0000-0000-0000-00000000000e', '61000000-0000-0000-0000-00000000000e', 'owner');

INSERT INTO public.clients (id, workspace_id, name)
SELECT format('c6000000-0000-0000-0000-00000000000%s', s)::uuid,
       format('a6000000-0000-0000-0000-00000000000%s', s)::uuid, 'Client ' || s
FROM unnest(array['a', 'b', 'c', 'd', 'e']) AS s;

INSERT INTO public.projects (id, workspace_id, client_id, name)
SELECT format('d6000000-0000-0000-0000-00000000000%s', s)::uuid,
       format('a6000000-0000-0000-0000-00000000000%s', s)::uuid,
       format('c6000000-0000-0000-0000-00000000000%s', s)::uuid, 'Project ' || s
FROM unnest(array['a', 'b', 'c', 'd', 'e']) AS s;

INSERT INTO public.demo_sandboxes (workspace_id, free_workspace_id, owner_user_id, member_user_id, client_one_user_id, client_two_user_id, visitor_hash)
VALUES
  ('a6000000-0000-0000-0000-00000000000a', NULL, '61000000-0000-0000-0000-00000000000a', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ai-a'),
  ('a6000000-0000-0000-0000-00000000000b', NULL, '61000000-0000-0000-0000-00000000000b', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ai-b'),
  ('a6000000-0000-0000-0000-00000000000c', 'a6000000-0000-0000-0000-00000000000d', '61000000-0000-0000-0000-00000000000c', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ai-c'),
  ('a6000000-0000-0000-0000-00000000000e', NULL, '61000000-0000-0000-0000-00000000000e', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'ai-e');

-- Grants ---------------------------------------------------------------

SELECT ok(
  has_function_privilege('authenticated', 'public.claim_ai_draft(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.claim_ai_draft(uuid)', 'EXECUTE'),
  'claim_ai_draft is still executable by authenticated and not by anon'
);

-- Per-sandbox limit -------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000a","email":"ai-limits-a@demo.clientdesk.invalid","role":"authenticated"}';

SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000a')), NULL, 'sandbox draft 1 of 3 is allowed');
SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000a')), NULL, 'sandbox draft 2 of 3 is allowed');
SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000a')), NULL, 'sandbox draft 3 of 3 is allowed');
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-00000000000a') $$,
  'CD004'::char(5),
  'ai_demo_limit',
  'the 4th draft in a sandbox is refused with CD004 ai_demo_limit'
);
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests WHERE workspace_id = 'a6000000-0000-0000-0000-00000000000a'),
  3,
  'a refused claim leaves no row behind'
);

-- No time window: the sandbox's own requests count however old they are.
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage
   WHERE sandbox_id = (SELECT id FROM public.demo_sandboxes WHERE visitor_hash = 'ai-a')),
  3,
  'each allowed demo claim wrote one ledger row for its sandbox'
);
UPDATE public.ai_draft_requests SET created_at = now() - interval '30 hours'
WHERE workspace_id = 'a6000000-0000-0000-0000-00000000000a';
UPDATE public.demo_ai_usage SET created_at = now() - interval '30 hours'
WHERE sandbox_id = (SELECT id FROM public.demo_sandboxes WHERE visitor_hash = 'ai-a');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000a","email":"ai-limits-a@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-00000000000a') $$,
  'CD004'::char(5),
  'ai_demo_limit',
  'requests older than 24 hours still count toward the sandbox limit'
);

-- Deleting the project (and the client) clears the draft requests' project
-- reference and leaves the ledger alone, so the visitor cannot start over by
-- recreating them.
RESET ROLE;
DELETE FROM public.projects WHERE id = 'd6000000-0000-0000-0000-00000000000a';
DELETE FROM public.clients WHERE id = 'c6000000-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests
     WHERE workspace_id = 'a6000000-0000-0000-0000-00000000000a' AND project_id IS NULL),
  3,
  'fixture: deleting the project kept its draft request rows, with a null project'
);
INSERT INTO public.clients (id, workspace_id, name)
VALUES ('c6000000-0000-0000-0000-0000000000f1', 'a6000000-0000-0000-0000-00000000000a', 'Replacement client');
INSERT INTO public.projects (id, workspace_id, client_id, name)
VALUES ('d6000000-0000-0000-0000-0000000000f1', 'a6000000-0000-0000-0000-00000000000a',
        'c6000000-0000-0000-0000-0000000000f1', 'Replacement project');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000a","email":"ai-limits-a@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-0000000000f1') $$,
  'CD004'::char(5),
  'ai_demo_limit',
  'deleting the project and client does not reset the sandbox AI limit'
);

-- Both workspaces of a sandbox share the 3 drafts.
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000c","email":"ai-limits-c@demo.clientdesk.invalid","role":"authenticated"}';
SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000c')), NULL, 'sandbox C: draft 1 in the main workspace');
SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000d')), NULL, 'sandbox C: draft 2 in the second workspace');
SELECT isnt((SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000c')), NULL, 'sandbox C: draft 3 in the main workspace');
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-00000000000d') $$,
  'CD004'::char(5),
  'ai_demo_limit',
  'sandbox C: the 4th draft is refused in the second workspace too'
);

-- Outside a sandbox ---------------------------------------------------

RESET ROLE;
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
VALUES ('a0000000-0000-0000-0000-000000000001', 'cus_test_demo_ai_limits', 'active');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'a Pro workspace outside any sandbox is not held to the 3 draft demo limit'
);
SELECT throws_ok(
  $$ select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a');
     select public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a') $$,
  'CD003'::char(5),
  'ai_rate_limited',
  'the per-user hourly limit still applies outside a sandbox (CD003, not CD004)'
);

-- Global daily budget ----------------------------------------------------

-- Sandbox D holds the budget: 149 ledger rows in the window, plus 10 older
-- than 24 hours that must not count. Sandbox B has none of its own. The
-- ledger rows of earlier sandboxes are cleared so the count is exact.
RESET ROLE;
DELETE FROM public.demo_ai_usage;
INSERT INTO public.demo_ai_usage (sandbox_id, created_at)
SELECT (SELECT id FROM public.demo_sandboxes WHERE visitor_hash = 'ai-e'),
       now() - interval '1 hour' - (g || ' seconds')::interval
FROM generate_series(1, 149) AS g;
INSERT INTO public.demo_ai_usage (sandbox_id, created_at)
SELECT (SELECT id FROM public.demo_sandboxes WHERE visitor_hash = 'ai-e'),
       now() - interval '25 hours' - (g || ' seconds')::interval
FROM generate_series(1, 10) AS g;

SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE created_at > now() - interval '24 hours'),
  149,
  'fixture: 149 demo claims are inside the 24 hour window'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000b","email":"ai-limits-b@demo.clientdesk.invalid","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000b')),
  NULL,
  'the 150th demo draft of the day is allowed (older requests do not count)'
);
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-00000000000b') $$,
  'CD004'::char(5),
  'ai_demo_budget',
  'at the global cap a sandbox with only 1 draft of its own is refused with CD004 ai_demo_budget'
);

-- Expiring the sandbox that spent the budget does not give it back: the
-- ledger has no foreign key to the sandbox or its workspaces.
RESET ROLE;
DELETE FROM public.demo_sandboxes WHERE visitor_hash = 'ai-e';
DELETE FROM public.workspaces WHERE id = 'a6000000-0000-0000-0000-00000000000e';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000b","email":"ai-limits-b@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.claim_ai_draft('d6000000-0000-0000-0000-00000000000b') $$,
  'CD004'::char(5),
  'ai_demo_budget',
  'the daily budget stays spent after the sandbox that used it is deleted'
);

-- A workspace outside a sandbox does not count toward, or fall under, the budget.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d0000000-0000-0000-0000-00000000000a')),
  NULL,
  'a Pro workspace outside any sandbox still claims when the demo budget is spent'
);

-- The budget is a rolling window: once D's requests age out, claims work again.
RESET ROLE;
UPDATE public.demo_ai_usage SET created_at = now() - interval '25 hours'
WHERE created_at > now() - interval '24 hours'
  AND sandbox_id <> (SELECT id FROM public.demo_sandboxes WHERE visitor_hash = 'ai-b');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"61000000-0000-0000-0000-00000000000b","email":"ai-limits-b@demo.clientdesk.invalid","role":"authenticated"}';
SELECT isnt(
  (SELECT public.claim_ai_draft('d6000000-0000-0000-0000-00000000000b')),
  NULL,
  'the global budget is a rolling 24 hour window'
);

-- The ledger ------------------------------------------------------------

RESET ROLE;
SELECT ok(
  NOT has_table_privilege('anon', 'public.demo_ai_usage', 'SELECT, INSERT, UPDATE, DELETE')
    AND NOT has_table_privilege('authenticated', 'public.demo_ai_usage', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.demo_ai_usage', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.demo_ai_usage', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.demo_ai_usage', 'DELETE'),
  'anon and authenticated have no privileges on demo_ai_usage'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.demo_ai_usage'::regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'demo_ai_usage'),
  'demo_ai_usage has row level security on and no policy'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.demo_ai_usage'::regclass AND contype = 'f'
  ),
  'demo_ai_usage has no foreign keys, so nothing a visitor deletes can reach it'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'demo_ai_usage'
      AND indexdef ILIKE '%(created_at)%'
  ),
  'the daily budget count has an index on created_at'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ select count(*) from public.demo_ai_usage $$,
  '42501',
  'permission denied for table demo_ai_usage',
  'a signed-in user cannot read the ledger'
);

SELECT * FROM finish();
ROLLBACK;
