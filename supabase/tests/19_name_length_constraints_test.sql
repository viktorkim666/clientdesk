-- Name-length CHECK constraints on clients.name, projects.name and
-- workspaces.name, matching the Zod limits in
-- src/lib/validation/{client,project,workspace}.ts (100, 120 and 60
-- characters respectively). Enforced at the DB level too, not just in the
-- client-side schema, since nothing stops a direct insert (or a future
-- caller) from skipping Zod.
BEGIN;
SELECT plan(12);

-- Guards against a future edit that adds NOT VALID back without a
-- following VALIDATE CONSTRAINT, which would leave pre-existing rows
-- unchecked while looking, at a glance, like the constraint is enforced.
SELECT ok(
  (SELECT convalidated FROM pg_constraint WHERE conname = 'workspaces_name_length'),
  'workspaces_name_length is validated, not left NOT VALID'
);

SELECT ok(
  (SELECT convalidated FROM pg_constraint WHERE conname = 'clients_name_length'),
  'clients_name_length is validated, not left NOT VALID'
);

SELECT ok(
  (SELECT convalidated FROM pg_constraint WHERE conname = 'projects_name_length'),
  'projects_name_length is validated, not left NOT VALID'
);

-- workspaces.name: 1-60 characters.
SELECT throws_ok(
  $$ insert into public.workspaces (name, slug, created_by)
       values ('', 'empty-name-workspace', '00000001-0000-0000-0000-000000000001') $$,
  'new row for relation "workspaces" violates check constraint "workspaces_name_length"',
  'an empty workspace name is rejected'
);

SELECT throws_ok(
  $$ insert into public.workspaces (name, slug, created_by)
       values (repeat('a', 61), 'too-long-name-workspace', '00000001-0000-0000-0000-000000000001') $$,
  'new row for relation "workspaces" violates check constraint "workspaces_name_length"',
  'a 61-character workspace name is rejected'
);

SELECT lives_ok(
  $$ insert into public.workspaces (name, slug, created_by)
       values (repeat('a', 60), 'max-length-name-workspace', '00000001-0000-0000-0000-000000000001') $$,
  'a 60-character workspace name is accepted'
);

-- clients.name: 1-100 characters. Uses the seeded Pro workspace
-- (20000000-...-000000000001, supabase/seed.sql) so the free-plan
-- two-client cap (private.enforce_client_limit) never gets in the way of
-- what this test actually checks.
SELECT throws_ok(
  $$ insert into public.clients (workspace_id, name)
       values ('20000000-0000-0000-0000-000000000001', '') $$,
  'new row for relation "clients" violates check constraint "clients_name_length"',
  'an empty client name is rejected'
);

SELECT throws_ok(
  $$ insert into public.clients (workspace_id, name)
       values ('20000000-0000-0000-0000-000000000001', repeat('a', 101)) $$,
  'new row for relation "clients" violates check constraint "clients_name_length"',
  'a 101-character client name is rejected'
);

SELECT lives_ok(
  $$ insert into public.clients (workspace_id, name)
       values ('20000000-0000-0000-0000-000000000001', repeat('a', 100)) $$,
  'a 100-character client name is accepted'
);

-- projects.name: 1-120 characters.
SELECT throws_ok(
  $$ insert into public.projects (workspace_id, client_id, name)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', '') $$,
  'new row for relation "projects" violates check constraint "projects_name_length"',
  'an empty project name is rejected'
);

SELECT throws_ok(
  $$ insert into public.projects (workspace_id, client_id, name)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', repeat('a', 121)) $$,
  'new row for relation "projects" violates check constraint "projects_name_length"',
  'a 121-character project name is rejected'
);

SELECT lives_ok(
  $$ insert into public.projects (workspace_id, client_id, name)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', repeat('a', 120)) $$,
  'a 120-character project name is accepted'
);

SELECT * FROM finish();
ROLLBACK;
