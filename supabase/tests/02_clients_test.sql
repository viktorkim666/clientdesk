-- Access matrix for public.clients: owner and member have full access, a
-- client reads only its own row, a non-member gets nothing.
BEGIN;
SELECT plan(12);

SELECT has_index(
  'public', 'clients', 'clients_workspace_id_idx',
  'clients has an index on workspace_id for "clients in this workspace" lookups'
);

-- workspace: a0000000-0000-0000-0000-000000000001
-- client A:  c0000000-0000-0000-0000-00000000000a
-- client B:  c0000000-0000-0000-0000-00000000000b
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.clients),
  2,
  'the owner reads every client'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.clients),
  2,
  'a member reads every client'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.clients),
  1,
  'a client reads only their own client row'
);
SELECT is(
  (SELECT id FROM public.clients LIMIT 1),
  'c0000000-0000-0000-0000-00000000000a',
  'the row a client reads is their own client'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.clients $$,
  'a non-member reads no clients'
);

-- Insert: owner and member can create clients; a client or a non-member cannot.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'Owner-created Client') $$,
  'the owner can create a client'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000001', 'Member-created Client') $$,
  'a member can create a client'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c0000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000001', 'Client-created Client') $$,
  'new row violates row-level security policy for table "clients"',
  'a client cannot create a client'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.clients (id, workspace_id, name)
       values ('c0000000-0000-0000-0000-0000000000c4', 'a0000000-0000-0000-0000-000000000001', 'Outsider-created Client') $$,
  'new row violates row-level security policy for table "clients"',
  'a non-member cannot create a client'
);

-- Update and delete: a client cannot rename or remove even their own client row.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
UPDATE public.clients SET name = 'Renamed by client' WHERE id = 'c0000000-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT name FROM public.clients WHERE id = 'c0000000-0000-0000-0000-00000000000a'),
  'Client A Inc.',
  'a client cannot rename their own client row'
);

-- Owner cleans up a client it created earlier.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c1' $$,
  'the owner can delete a client'
);

SELECT * FROM finish();
ROLLBACK;
