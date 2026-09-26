-- Access matrix for public.workspaces: owner reads and updates, member and
-- client read only, a non-member gets nothing.
BEGIN;
SELECT plan(8);

-- Fixture ids from supabase/seed.sql.
-- workspace: a0000000-0000-0000-0000-000000000001
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A:  0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

-- A non-member sees nothing.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select id from public.workspaces $$,
  'a non-member sees no workspaces'
);

-- Owner, member and client all see the workspace they belong to.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspaces),
  1,
  'the owner sees the workspace they own'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspaces),
  1,
  'a member sees the workspace'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspaces),
  1,
  'a client sees the workspace'
);

-- Attempted updates by roles that only have read access are silently filtered
-- (0 rows affected), never applied.
UPDATE public.workspaces SET name = 'hacked by client' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'Acme Agency',
  'a client cannot rename the workspace'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
UPDATE public.workspaces SET name = 'hacked by member' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'Acme Agency',
  'a member cannot rename the workspace'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
UPDATE public.workspaces SET name = 'hacked by outsider' WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- A non-member cannot even read the workspace to confirm this, so check
-- from the owner's point of view that the name is still unchanged.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'Acme Agency',
  'a non-member cannot rename the workspace'
);

-- Only the owner can rename the workspace.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
UPDATE public.workspaces SET name = 'Acme Agency Renamed' WHERE id = 'a0000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  'Acme Agency Renamed',
  'the owner can rename the workspace'
);

SELECT * FROM finish();
ROLLBACK;
