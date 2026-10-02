-- Access matrix for public.clients: owner and member have full access, a
-- client reads only its own row, a non-member gets nothing.
BEGIN;
SELECT plan(26);

-- The seeded workspace already has 2 clients, the Free limit. A billing row
-- keeps it on Pro so the inserts below test RLS only, not the client limit
-- (that trigger has its own tests in 13_plan_limits_test.sql).
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'cus_test_clients_rls', 'active');

SELECT has_index(
  'public', 'clients', 'clients_workspace_id_idx',
  'clients has an index on workspace_id for "clients in this workspace" lookups'
);

SELECT has_index(
  'public', 'invitations', 'invitations_client_id_idx',
  'invitations has an index on client_id for the delete cascade and the clients page embed'
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

-- Rename: a member can rename a client; the name stays between 1 and 100
-- characters.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
UPDATE public.clients SET name = 'Renamed by member'
  WHERE id = 'c0000000-0000-0000-0000-0000000000c2';
SELECT is(
  (SELECT name FROM public.clients WHERE id = 'c0000000-0000-0000-0000-0000000000c2'),
  'Renamed by member',
  'a member can rename a client'
);
SELECT throws_ok(
  $$ update public.clients set name = '' where id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  '23514',
  NULL,
  'a client name cannot be empty'
);
SELECT throws_ok(
  $$ update public.clients set name = repeat('x', 101) where id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  '23514',
  NULL,
  'a client name cannot exceed 100 characters'
);

-- Delete: a member can delete a client nothing points at.
SELECT lives_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  'a member can delete an empty client'
);
SELECT is_empty(
  $$ select 1 from public.clients where id = 'c0000000-0000-0000-0000-0000000000c2' $$,
  'the deleted empty client is gone'
);

-- A client cannot delete even their own client row; row-level security hides
-- the row from the delete, so nothing happens and nothing is raised.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
DELETE FROM public.clients WHERE id = 'c0000000-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'c0000000-0000-0000-0000-00000000000a'),
  1,
  'a client cannot delete their own client row'
);

-- A non-member cannot delete a client either.
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
DELETE FROM public.clients WHERE id = 'c0000000-0000-0000-0000-00000000000b';
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE id = 'c0000000-0000-0000-0000-00000000000b'),
  1,
  'a non-member cannot delete a client'
);

-- A client that has projects and no people cannot be deleted: the foreign key
-- from projects refuses it, whoever asks. The fixtures need to bypass
-- row-level security.
RESET ROLE;
INSERT INTO public.clients (id, workspace_id, name)
  VALUES ('c0000000-0000-0000-0000-0000000000c5', 'a0000000-0000-0000-0000-000000000001', 'Client With Projects');
INSERT INTO public.projects (id, workspace_id, client_id, name)
  VALUES ('d0000000-0000-0000-0000-0000000000c5', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c5', 'Project Of Client With Projects');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c5' $$,
  '23503',
  'update or delete on table "clients" violates foreign key constraint "projects_client_id_workspace_id_fkey" on table "projects"',
  'a client with projects and no people cannot be deleted, and it is the projects key that refuses'
);

-- A client with people and no projects cannot be deleted either. The fixtures
-- need to bypass row-level security.
RESET ROLE;
INSERT INTO public.clients (id, workspace_id, name)
  VALUES ('c0000000-0000-0000-0000-0000000000c6', 'a0000000-0000-0000-0000-000000000001', 'Client With People');
INSERT INTO public.workspace_members (workspace_id, user_id, role, client_id)
  VALUES ('a0000000-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000009', 'client', 'c0000000-0000-0000-0000-0000000000c6');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c6' $$,
  '23503',
  'update or delete on table "clients" violates foreign key constraint "workspace_members_client_id_workspace_id_fkey" on table "workspace_members"',
  'a client with people and no projects cannot be deleted, and it is the members key that refuses'
);

-- Invitations go with the client, accepted or not.
RESET ROLE;
INSERT INTO public.clients (id, workspace_id, name)
  VALUES ('c0000000-0000-0000-0000-0000000000c7', 'a0000000-0000-0000-0000-000000000001', 'Client With Invitations');
INSERT INTO public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at, accepted_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'accepted@clientdesk.test', 'client', 'c0000000-0000-0000-0000-0000000000c7', 'token-hash-accepted', '00000001-0000-0000-0000-000000000001', now() + interval '7 days', now()),
  ('a0000000-0000-0000-0000-000000000001', 'pending@clientdesk.test', 'client', 'c0000000-0000-0000-0000-0000000000c7', 'token-hash-pending', '00000001-0000-0000-0000-000000000001', now() + interval '7 days', NULL);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c7' $$,
  'a member can delete a client that only has invitations'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.invitations WHERE client_id = 'c0000000-0000-0000-0000-0000000000c7'),
  0,
  'the accepted and the pending invitation went with the client'
);

-- A client can be deleted once its last project is deleted.
INSERT INTO public.clients (id, workspace_id, name)
  VALUES ('c0000000-0000-0000-0000-0000000000c8', 'a0000000-0000-0000-0000-000000000001', 'Client With One Project');
INSERT INTO public.projects (id, workspace_id, client_id, name)
  VALUES ('d0000000-0000-0000-0000-0000000000c8', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000c8', 'Last Project');
SET LOCAL ROLE authenticated;
DELETE FROM public.projects WHERE id = 'd0000000-0000-0000-0000-0000000000c8';
SELECT lives_ok(
  $$ delete from public.clients where id = 'c0000000-0000-0000-0000-0000000000c8' $$,
  'a client can be deleted once its last project is deleted'
);
SELECT is_empty(
  $$ select 1 from public.clients where id = 'c0000000-0000-0000-0000-0000000000c8' $$,
  'the client whose last project was deleted is gone'
);

SELECT * FROM finish();
ROLLBACK;
