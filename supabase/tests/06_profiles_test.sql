-- Visibility for public.profiles: a user always reads their own profile, and
-- also reads the profiles of people who share a workspace with them, scoped
-- the same way workspace_members visibility is: a client sees staff and
-- themselves only, never another client's profile.
BEGIN;
SELECT plan(6);

-- workspace: a0000000-0000-0000-0000-000000000001
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- client B user: 0000000b-0000-0000-0000-00000000000b
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  4,
  'the owner reads every profile in the workspace'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  4,
  'a member reads every profile in the workspace'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  3,
  'a client reads staff profiles and their own, not another client''s'
);

-- Attack: client A reading client B's profile directly.
SELECT is_empty(
  $$ select 1 from public.profiles where id = '0000000b-0000-0000-0000-00000000000b' $$,
  'client A cannot read client B''s profile'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  1,
  'a non-member reads only their own profile'
);
SELECT is(
  (SELECT id FROM public.profiles LIMIT 1),
  '00000009-0000-0000-0000-000000000009',
  'the only profile a non-member reads is their own'
);

SELECT * FROM finish();
ROLLBACK;
