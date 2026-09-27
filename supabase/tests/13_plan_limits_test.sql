-- private.workspace_plan(): 'pro' only while the subscription status is
-- active, trialing or past_due; everything else, including no billing row
-- at all, is 'free'. Then the Free client limit trigger on public.clients:
-- two clients is fine, a third raises, an active subscription lifts the
-- limit, and switching back to canceled keeps the existing clients but
-- blocks the next insert again.
BEGIN;
SELECT plan(14);

-- workspace: a0000000-0000-0000-0000-000000000001 (seeded, no billing row)
-- private is not exposed to `authenticated`, so the plan rule is checked
-- here as the privileged role the test runs as before any `SET LOCAL ROLE`,
-- the same role that can already read every table directly (see
-- 10_storage_objects_test.sql's bucket-configuration checks).

SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'a workspace with no billing row at all is free'
);

INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'cus_test_plan_rule', NULL);
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'a billing row with a null subscription_status is free'
);

UPDATE public.workspace_billing SET subscription_status = 'canceled'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'a canceled subscription is free'
);

UPDATE public.workspace_billing SET subscription_status = 'unpaid'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'an unpaid subscription is free'
);

UPDATE public.workspace_billing SET subscription_status = 'incomplete'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'an incomplete subscription is free'
);

UPDATE public.workspace_billing SET subscription_status = 'incomplete_expired'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'an incomplete_expired subscription is free'
);

UPDATE public.workspace_billing SET subscription_status = 'paused'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'free',
  'a paused subscription is free'
);

UPDATE public.workspace_billing SET subscription_status = 'active'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'pro',
  'an active subscription is pro'
);

UPDATE public.workspace_billing SET subscription_status = 'trialing'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'pro',
  'a trialing subscription is pro'
);

UPDATE public.workspace_billing SET subscription_status = 'past_due'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  private.workspace_plan('a0000000-0000-0000-0000-000000000001'),
  'pro',
  'a past_due subscription is pro (Stripe is still retrying payment)'
);

-- Client limit trigger, exercised through RLS as a real staff caller
-- (`authenticated`), not through the privileged role above, so the test
-- proves the trigger fires for the same path the app uses.
--
-- A fresh workspace, owned by the seeded owner, already at the Free limit
-- of 2 clients.
INSERT INTO public.workspaces (id, name, slug, created_by) VALUES (
  'b0000000-0000-0000-0000-000000000001', 'Limit Test Co', 'limit-test-co',
  '00000001-0000-0000-0000-000000000001'
);
INSERT INTO public.workspace_members (workspace_id, user_id, role, client_id) VALUES (
  'b0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 'owner', NULL
);
INSERT INTO public.clients (id, workspace_id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Limit Client One'),
  ('c1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Limit Client Two');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';

-- Attack: a third client on Free is refused, matched by both the trigger's
-- SQLSTATE (what the server action switches on) and its message.
SELECT throws_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Limit Client Three') $$,
  'CD001'::char(5),
  'plan_limit_clients',
  'a Free workspace at 2 clients refuses a third'
);

-- Upgrading to Pro lifts the limit.
RESET ROLE;
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
  VALUES ('b0000000-0000-0000-0000-000000000001', 'cus_test_limit_co', 'active');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Limit Client Three') $$,
  'a Pro workspace can add a third client'
);

-- Downgrading back to Free keeps the three existing clients...
RESET ROLE;
UPDATE public.workspace_billing SET subscription_status = 'canceled'
  WHERE workspace_id = 'b0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = 'b0000000-0000-0000-0000-000000000001'),
  3,
  'downgrading to Free does not remove existing clients'
);

-- ...but refuses the next insert, named the same way as the first attack.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Limit Client Four') $$,
  'plan_limit_clients',
  'back on Free, the next insert is refused again'
);

SELECT * FROM finish();
ROLLBACK;
