-- The project-files bucket configuration, and access to storage.objects
-- within it, including the attack cases: client A reading or deleting client
-- B's object, client A uploading into client B's project path, and a
-- malformed (non-UUID) path denied without raising.
BEGIN;
SELECT plan(12);

-- workspace: a0000000-0000-0000-0000-000000000001
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- project B (client B): d0000000-0000-0000-0000-00000000000b
-- owner:     00000001-0000-0000-0000-000000000001
-- client A user: 0000000a-0000-0000-0000-00000000000a

-- Bucket configuration.
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'project-files'),
  false,
  'the project-files bucket is private'
);
SELECT is(
  (SELECT file_size_limit::int FROM storage.buckets WHERE id = 'project-files'),
  10485760,
  'the project-files bucket caps uploads at 10 MiB'
);
SELECT is(
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'project-files'),
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ],
  'the project-files bucket allows only the approved MIME types'
);

-- Fixture objects, inserted as postgres (bypassing RLS) so the policies
-- below are exercised in isolation.
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('project-files',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000a/kickoff-notes.pdf',
   '00000001-0000-0000-0000-000000000001'),
  ('project-files',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000b/brand-refresh-brief.pdf',
   '00000001-0000-0000-0000-000000000001'),
  ('project-files',
   'not-a-uuid/also-not-a-uuid/still-not/malformed.txt',
   '00000001-0000-0000-0000-000000000001'),
  ('project-files',
   'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000c/client-a-upload.pdf',
   '0000000a-0000-0000-0000-00000000000a');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'project-files'),
  2,
  'client A can only see the objects under their own project'
);

-- Attack: client A reading client B's object directly by name.
SELECT is_empty(
  $$ select 1 from storage.objects
       where name = 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000b/brand-refresh-brief.pdf' $$,
  'client A cannot read client B''s object'
);

-- Attack: a malformed path is denied, not raised.
SELECT lives_ok(
  $$ select 1 from storage.objects where name = 'not-a-uuid/also-not-a-uuid/still-not/malformed.txt' $$,
  'a malformed storage path is denied without raising'
);
SELECT is_empty(
  $$ select 1 from storage.objects where name = 'not-a-uuid/also-not-a-uuid/still-not/malformed.txt' $$,
  'a malformed storage path is invisible to a client'
);

-- Attack: client A cannot upload into client B's project path.
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('project-files',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-0000000000cc/sneaky.pdf',
               '0000000a-0000-0000-0000-00000000000a') $$,
  'new row violates row-level security policy for table "objects"',
  'client A cannot upload into client B''s project path'
);

-- Client A can upload into their own project's path.
SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('project-files',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-0000000000cd/client-upload.pdf',
               '0000000a-0000-0000-0000-00000000000a') $$,
  'client A can upload into their own project''s path'
);

-- Attack: client A cannot delete client B's object. Direct SQL deletes on
-- storage tables are blocked by storage.protect_objects_delete unless this
-- session setting opts in, which pgTAP needs to exercise the delete policy.
SET LOCAL storage.allow_delete_query TO 'true';
DELETE FROM storage.objects
  WHERE name = 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000b/brand-refresh-brief.pdf';

-- Client A cannot even see client B's object, so the row's survival is
-- checked as postgres (bypassing RLS) rather than through client A's view.
RESET ROLE;
SELECT isnt_empty(
  $$ select 1 from storage.objects
       where name = 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000b/brand-refresh-brief.pdf' $$,
  'client A cannot delete client B''s object'
);

-- The owner is staff of the workspace both objects below live in, so the
-- delete policy's `private.is_staff` branch (not just an object's own
-- `owner_id`) lets them clean up a file a client uploaded, and the insert
-- policy lets them place a file under a project that belongs to a different
-- client than the one they're a member of.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SET LOCAL storage.allow_delete_query TO 'true';
DELETE FROM storage.objects
  WHERE name = 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000c/client-a-upload.pdf';

RESET ROLE;
SELECT is_empty(
  $$ select 1 from storage.objects
       where name = 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000c/client-a-upload.pdf' $$,
  'the owner can delete an object a client uploaded'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('project-files',
               'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-0000000000ce/owner-upload-for-client-b.pdf',
               '00000001-0000-0000-0000-000000000001') $$,
  'the owner can upload into client B''s project path'
);

SELECT * FROM finish();
ROLLBACK;
