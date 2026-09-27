-- Access matrix for public.workspace_billing: owner and member read the
-- workspace's own row, a client and a non-member see nothing, and no role
-- reaching Postgres as `authenticated` can insert, update or delete a row
-- (attack: a member or client setting subscription_status = 'active' by hand).
BEGIN;
SELECT plan(11);

-- workspace: a0000000-0000-0000-0000-000000000001
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

-- Fixture: a billing row for the seeded workspace, written directly, the way
-- only the webhook and the sync function (through the admin client) would in
-- the app. updated_at is stamped in the past here so the trigger test below
-- has a stale value to prove wrong; INSERT doesn't fire a `before update`
-- trigger, so this is the only way to get a controlled starting value past
-- the trigger under test.
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status, updated_at)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'cus_test_acme', 'active', '2000-01-01T00:00:00Z');

-- updated_at trigger: run as the privileged role the test starts as (the
-- same role the app's admin client writes as), before any `SET LOCAL ROLE
-- authenticated` below removes update privileges on this table entirely.
-- Compared against the fixture's explicit past timestamp rather than
-- now(): now() is frozen to this transaction's start, so a row updated
-- later in the same transaction as its insert would look unchanged either
-- way, proving nothing about the trigger.
UPDATE public.workspace_billing SET subscription_status = 'trialing'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT isnt(
  (SELECT updated_at FROM public.workspace_billing WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'updating the row bumps updated_at'
);
UPDATE public.workspace_billing SET subscription_status = 'active'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_billing),
  1,
  'the owner reads their workspace''s billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_billing),
  1,
  'a member reads the workspace''s billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.workspace_billing $$,
  'a client reads no billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.workspace_billing $$,
  'a non-member reads no billing row'
);

-- Insert: there is no insert policy at all, so every authenticated role,
-- including the owner, is refused.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.workspace_billing (workspace_id, stripe_customer_id)
       values ('a0000000-0000-0000-0000-000000000001', 'cus_test_owner_attempt') $$,
  'new row violates row-level security policy for table "workspace_billing"',
  'the owner cannot insert a billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.workspace_billing (workspace_id, stripe_customer_id)
       values ('a0000000-0000-0000-0000-000000000001', 'cus_test_member_attempt') $$,
  'new row violates row-level security policy for table "workspace_billing"',
  'a member cannot insert a billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.workspace_billing (workspace_id, stripe_customer_id)
       values ('a0000000-0000-0000-0000-000000000001', 'cus_test_client_attempt') $$,
  'new row violates row-level security policy for table "workspace_billing"',
  'a client cannot insert a billing row'
);

-- Update and delete: there is no policy for either, so the row is simply not
-- visible to the update/delete planner and the statement affects no rows,
-- the same silent-filter behavior as workspaces_test's read-only roles.
-- Attack: a member sets subscription_status = 'active' by hand.
UPDATE public.workspace_billing
  SET subscription_status = 'active', stripe_customer_id = 'cus_test_member_hack'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT stripe_customer_id FROM public.workspace_billing WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'),
  'cus_test_acme',
  'a member cannot change the billing row'
);

-- Attack: a client sets subscription_status = 'active' by hand.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
UPDATE public.workspace_billing
  SET subscription_status = 'active', stripe_customer_id = 'cus_test_client_hack'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT stripe_customer_id FROM public.workspace_billing WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'),
  'cus_test_acme',
  'a client cannot change the billing row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
DELETE FROM public.workspace_billing WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_billing),
  1,
  'the owner cannot delete the billing row'
);

SELECT * FROM finish();
ROLLBACK;
