-- Access matrix for public.project_updates, including the attack cases: a
-- client posting an update, and a client deleting an update on their own
-- project.
BEGIN;
SELECT plan(11);

-- workspace: a0000000-0000-0000-0000-000000000001
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- project B (client B): d0000000-0000-0000-0000-00000000000b
-- update on project A: e0000000-0000-0000-0000-00000000000a
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- client B user: 0000000b-0000-0000-0000-00000000000b
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_updates),
  2,
  'the owner reads every update'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_updates),
  2,
  'a member reads every update'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_updates),
  1,
  'client A reads only the update on their own project'
);

-- Attack: client A reading client B's update directly by project_id.
SELECT is_empty(
  $$ select 1 from public.project_updates where project_id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'client A cannot read client B''s update'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000b-0000-0000-0000-00000000000b","email":"client-b@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_updates),
  1,
  'client B reads only the update on their own project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.project_updates $$,
  'a non-member reads no updates'
);

-- Insert: owner and member can post updates; a client cannot.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.project_updates (workspace_id, project_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
               '00000001-0000-0000-0000-000000000001', 'Owner-posted update') $$,
  'the owner can post an update'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.project_updates (workspace_id, project_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b',
               '00000002-0000-0000-0000-000000000002', 'Member-posted update') $$,
  'a member can post an update'
);

-- Attack: a client cannot post an update, even on their own project.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.project_updates (workspace_id, project_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
               '0000000a-0000-0000-0000-00000000000a', 'Client-posted update') $$,
  'new row violates row-level security policy for table "project_updates"',
  'a client cannot post an update'
);

-- Attack: a client cannot delete an update, not even one on their own project.
DELETE FROM public.project_updates WHERE id = 'e0000000-0000-0000-0000-00000000000a';
SELECT isnt_empty(
  $$ select 1 from public.project_updates where id = 'e0000000-0000-0000-0000-00000000000a' $$,
  'a client cannot delete an update'
);

-- The owner can delete an update.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
DELETE FROM public.project_updates WHERE id = 'e0000000-0000-0000-0000-00000000000a';
SELECT is_empty(
  $$ select 1 from public.project_updates where id = 'e0000000-0000-0000-0000-00000000000a' $$,
  'the owner can delete an update'
);

SELECT * FROM finish();
ROLLBACK;
