-- Access matrix for public.projects, including the attack case: client A
-- reading client B's projects.
BEGIN;
SELECT plan(20);

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

-- Delete: only the projects this test inserted are deleted, never the seeded
-- ones. A client cannot delete a project, even their own.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
DELETE FROM public.projects WHERE name = 'Owner-created project';
SELECT is(
  (SELECT count(*)::int FROM public.projects WHERE name = 'Owner-created project'),
  1,
  'a client cannot delete their own project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
DELETE FROM public.projects WHERE name = 'Member-created project';
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects WHERE name = 'Member-created project'),
  1,
  'a non-member cannot delete a project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
DELETE FROM public.projects WHERE name = 'Member-created project';
SELECT is_empty(
  $$ select 1 from public.projects where name = 'Member-created project' $$,
  'a member can delete a project'
);

-- The owner deletes a project that has updates, comments, files and draft
-- requests. The fixtures bypass row-level security.
RESET ROLE;
INSERT INTO public.projects (id, workspace_id, client_id, name)
  VALUES ('d0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Project with content');
INSERT INTO public.project_updates (id, workspace_id, project_id, author_id, body)
  VALUES ('e0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000d1', '00000001-0000-0000-0000-000000000001', 'Update to be deleted.');
INSERT INTO public.update_comments (id, workspace_id, project_id, update_id, author_id, body)
  VALUES ('f0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000d1', '0000000a-0000-0000-0000-00000000000a', 'Comment to be deleted.');
INSERT INTO public.project_files (id, workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
  VALUES ('90000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000d1', '00000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-0000000000d1/90000000-0000-0000-0000-0000000000d1/notes.pdf', 'notes.pdf', 1024, 'application/pdf');
INSERT INTO public.ai_draft_requests (id, workspace_id, user_id, project_id)
  VALUES ('a1000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-0000000000d1');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ delete from public.projects where id = 'd0000000-0000-0000-0000-0000000000d1' $$,
  'the owner can delete a project that has updates, comments, files and draft requests'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.projects WHERE id = 'd0000000-0000-0000-0000-0000000000d1'),
  0,
  'the deleted project is gone'
);
SELECT is(
  (SELECT
     (SELECT count(*) FROM public.project_updates WHERE project_id = 'd0000000-0000-0000-0000-0000000000d1')
   + (SELECT count(*) FROM public.update_comments WHERE project_id = 'd0000000-0000-0000-0000-0000000000d1')
   + (SELECT count(*) FROM public.project_files WHERE project_id = 'd0000000-0000-0000-0000-0000000000d1'))::int,
  0,
  'its updates, comments and files went with it'
);
-- The draft request is the ledger the AI rate limits count, so it outlives
-- the project: only its project reference is cleared.
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests
     WHERE id = 'a1000000-0000-0000-0000-0000000000d1'
       AND workspace_id = 'a0000000-0000-0000-0000-000000000001'
       AND project_id IS NULL),
  1,
  'its draft request stays, with no project, so the AI limits still count it'
);
SELECT is(
  (SELECT count(*)::int FROM public.projects
     WHERE id IN ('d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000b')
        OR name = 'Owner-created project'),
  3,
  'deleting a project leaves the other projects alone'
);

SELECT * FROM finish();
ROLLBACK;
