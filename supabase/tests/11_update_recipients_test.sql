-- public.project_update_recipients(), including the attack cases: a client
-- calling it for their own project, a non-member calling it, and an
-- anonymous caller.
BEGIN;
SELECT plan(6);

-- workspace: a0000000-0000-0000-0000-000000000001
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- project B (client B): d0000000-0000-0000-0000-00000000000b
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT array_agg(email ORDER BY email)
     FROM public.project_update_recipients('d0000000-0000-0000-0000-00000000000a') AS t (email)),
  ARRAY['client-a@clientdesk.test'],
  'the owner reads project A''s recipient emails'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT array_agg(email ORDER BY email)
     FROM public.project_update_recipients('d0000000-0000-0000-0000-00000000000b') AS t (email)),
  ARRAY['client-b@clientdesk.test'],
  'a member reads project B''s recipient emails'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.project_update_recipients('d0000000-0000-0000-0000-00000000000a') AS t (email)
     WHERE email = 'client-b@clientdesk.test'),
  0,
  'project A''s recipients never include client B''s email'
);

-- Attack: a client cannot call the recipients RPC, even for their own project.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.project_update_recipients('d0000000-0000-0000-0000-00000000000a') $$,
  'only staff can read a project''s update recipients',
  'a client cannot call the recipients RPC'
);

-- Attack: a non-member cannot call the recipients RPC.
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.project_update_recipients('d0000000-0000-0000-0000-00000000000a') $$,
  'only staff can read a project''s update recipients',
  'a non-member cannot call the recipients RPC'
);

-- Attack: an anonymous caller is rejected outright.
SET LOCAL ROLE anon;
RESET request.jwt.claims;
SELECT throws_ok(
  $$ select public.project_update_recipients('d0000000-0000-0000-0000-00000000000a') $$,
  'authentication required',
  'the recipients RPC is rejected for an anonymous caller'
);

SELECT * FROM finish();
ROLLBACK;
