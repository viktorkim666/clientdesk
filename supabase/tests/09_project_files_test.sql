-- Access matrix for public.project_files, including the attack cases:
-- client A reading client B's file rows, a client registering a file on
-- someone else's project, and a client deleting someone else's file.
BEGIN;
SELECT plan(11);

-- workspace: a0000000-0000-0000-0000-000000000001
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- project B (client B): d0000000-0000-0000-0000-00000000000b
-- file on project A, uploaded by the owner:    90000000-0000-0000-0000-00000000000a
-- file on project B, uploaded by the owner:    90000000-0000-0000-0000-00000000000b
-- file on project A, uploaded by client A:     90000000-0000-0000-0000-00000000000c
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_files),
  3,
  'the owner reads every file'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_files),
  3,
  'a member reads every file'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_files),
  2,
  'client A reads only the files on their own project'
);

-- Attack: client A reading client B's file directly by project_id.
SELECT is_empty(
  $$ select 1 from public.project_files where project_id = 'd0000000-0000-0000-0000-00000000000b' $$,
  'client A cannot read client B''s file'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.project_files $$,
  'a non-member reads no files'
);

-- Insert: the project's client and staff can both register a file.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
               '0000000a-0000-0000-0000-00000000000a',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000d/client-upload.pdf',
               'client-upload.pdf', 1024, 'application/pdf') $$,
  'client A can register a file on their own project'
);

-- Attack: client A cannot register a file on client B's project.
SELECT throws_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b',
               '0000000a-0000-0000-0000-00000000000a',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000e/sneaky.pdf',
               'sneaky.pdf', 1024, 'application/pdf') $$,
  'new row violates row-level security policy for table "project_files"',
  'client A cannot register a file on client B''s project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b',
               '00000001-0000-0000-0000-000000000001',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000f/owner-upload.pdf',
               'owner-upload.pdf', 1024, 'application/pdf') $$,
  'the owner can register a file on any project'
);

-- Attack: a client cannot delete someone else's file.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
DELETE FROM public.project_files WHERE id = '90000000-0000-0000-0000-00000000000a';
SELECT isnt_empty(
  $$ select 1 from public.project_files where id = '90000000-0000-0000-0000-00000000000a' $$,
  'client A cannot delete the owner''s file'
);

-- A client can delete their own file.
DELETE FROM public.project_files WHERE id = '90000000-0000-0000-0000-00000000000c';
SELECT is_empty(
  $$ select 1 from public.project_files where id = '90000000-0000-0000-0000-00000000000c' $$,
  'client A can delete their own file'
);

-- The owner can delete any file, including one uploaded by staff.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
DELETE FROM public.project_files WHERE id = '90000000-0000-0000-0000-00000000000b';
SELECT is_empty(
  $$ select 1 from public.project_files where id = '90000000-0000-0000-0000-00000000000b' $$,
  'the owner can delete any file'
);

SELECT * FROM finish();
ROLLBACK;
