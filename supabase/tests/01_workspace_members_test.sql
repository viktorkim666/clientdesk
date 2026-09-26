-- Access matrix for public.workspace_members, including the attack cases:
-- a member (or a client) promoting themselves to owner, and the last owner
-- of a workspace being removed or demoted.
BEGIN;
SELECT plan(11);

SELECT has_index(
  'public', 'workspace_members', 'workspace_members_user_id_idx',
  'workspace_members has an index on user_id for "every workspace this user is in" lookups'
);

-- workspace: a0000000-0000-0000-0000-000000000001
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A:  0000000a-0000-0000-0000-00000000000a
-- client B:  0000000b-0000-0000-0000-00000000000b
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members),
  4,
  'the owner reads every membership row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members),
  4,
  'a member reads every membership row'
);

-- A client reads the two staff rows plus their own row, but not the other
-- client's row.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members),
  3,
  'a client reads staff rows and their own row, not another client''s row'
);
SELECT is_empty(
  $$ select 1 from public.workspace_members where user_id = '0000000b-0000-0000-0000-00000000000b' $$,
  'client A cannot read client B''s membership row'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.workspace_members $$,
  'a non-member reads no membership rows'
);

-- Attack: a member cannot promote themselves to owner.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
UPDATE public.workspace_members
  SET role = 'owner'
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
    AND user_id = '00000002-0000-0000-0000-000000000002';
SELECT is(
  (SELECT role::text FROM public.workspace_members
     WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
       AND user_id = '00000002-0000-0000-0000-000000000002'),
  'member',
  'a member cannot promote themselves to owner'
);

-- Attack: a client cannot promote themselves to owner either.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
UPDATE public.workspace_members
  SET role = 'owner', client_id = NULL
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
    AND user_id = '0000000a-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT role::text FROM public.workspace_members
     WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
       AND user_id = '0000000a-0000-0000-0000-00000000000a'),
  'client',
  'a client cannot promote themselves to owner'
);

-- The last owner of a workspace can be neither demoted nor removed, even by
-- themselves, even though the owner role would otherwise permit the update.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ update public.workspace_members set role = 'member'
       where workspace_id = 'a0000000-0000-0000-0000-000000000001'
         and user_id = '00000001-0000-0000-0000-000000000001' $$,
  'cannot remove or demote the last owner of a workspace',
  'the last owner cannot demote themselves'
);
SELECT throws_ok(
  $$ delete from public.workspace_members
       where workspace_id = 'a0000000-0000-0000-0000-000000000001'
         and user_id = '00000001-0000-0000-0000-000000000001' $$,
  'cannot remove or demote the last owner of a workspace',
  'the last owner cannot be removed'
);

-- The owner can remove a non-owner member.
DELETE FROM public.workspace_members
  WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001'
    AND user_id = '00000002-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members),
  3,
  'the owner can remove a member'
);

SELECT * FROM finish();
ROLLBACK;
