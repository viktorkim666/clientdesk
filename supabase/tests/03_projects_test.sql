-- Access matrix for public.projects, including the attack case: client A
-- reading client B's projects.
BEGIN;
SELECT plan(12);

-- workspace: a0000000-0000-0000-0000-000000000001
-- client A:  c0000000-0000-0000-0000-00000000000a
-- client B:  c0000000-0000-0000-0000-00000000000b
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- client B user: 0000000b-0000-0000-0000-00000000000b
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects),
  2,
  'the owner reads every project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects),
  2,
  'a member reads every project'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects),
  1,
  'client A reads only their own project'
);
SELECT is(
  (SELECT name FROM public.projects LIMIT 1),
  'Client A Website Redesign',
  'the project client A reads is their own'
);

-- Attack: client A reading client B's project directly by client_id.
SELECT is_empty(
  $$ select 1 from public.projects where client_id = 'c0000000-0000-0000-0000-00000000000b' $$,
  'client A cannot read client B''s project'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000b-0000-0000-0000-00000000000b","email":"client-b@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects),
  1,
  'client B reads only their own project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.projects $$,
  'a non-member reads no projects'
);

-- Insert: owner and member can create projects; a client cannot.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.projects (workspace_id, client_id, name, status)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Owner-created project', 'active') $$,
  'the owner can create a project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.projects (workspace_id, client_id, name, status)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'Member-created project', 'active') $$,
  'a member can create a project'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.projects (workspace_id, client_id, name, status)
       values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Client-created project', 'active') $$,
  'new row violates row-level security policy for table "projects"',
  'a client cannot create a project'
);

-- Update: a client cannot change a project's status, even their own.
UPDATE public.projects SET status = 'done'
  WHERE client_id = 'c0000000-0000-0000-0000-00000000000a';
SELECT is(
  (SELECT status::text FROM public.projects WHERE client_id = 'c0000000-0000-0000-0000-00000000000a' LIMIT 1),
  'active',
  'a client cannot change a project''s status'
);

-- The owner can change a project's status.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
UPDATE public.projects SET status = 'done'
  WHERE client_id = 'c0000000-0000-0000-0000-00000000000a'
    AND name = 'Client A Website Redesign';
SELECT is(
  (SELECT status::text FROM public.projects
     WHERE client_id = 'c0000000-0000-0000-0000-00000000000a'
       AND name = 'Client A Website Redesign'),
  'done',
  'the owner can change a project''s status'
);

SELECT * FROM finish();
ROLLBACK;
