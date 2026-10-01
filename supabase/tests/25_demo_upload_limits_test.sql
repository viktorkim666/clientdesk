-- Upload limits inside a demo sandbox: at most 5 registered files per sandbox
-- for its whole life (files cloned from the template do not count, and
-- deleting a file frees nothing), 2 MB each, images and PDF only, all refused
-- with errcode CD005 and a message per reason. The size and type come from
-- the object Storage actually holds, not from what the file row claims. A
-- storage insert policy bounds the object count under the sandbox prefix and
-- accepts only canonical (lowercase) paths there, so a direct upload that
-- never registers a file row is bounded too, and refuses to recreate the
-- object behind a registered file. A workspace outside a sandbox keeps the
-- normal bucket rules. The trigger leaves non-members to row level security
-- and refuses a path that does not belong to the row.
BEGIN;
SELECT plan(50);

-- sandbox A (count and storage tests): users 71000000-...01 (owner) .. 04
-- sandbox B (size, type and shared-count tests): users 72000000-...01 .. 04
-- sandbox C (storage cap tests): users 73000000-...01 .. 04
-- non-demo workspace: a0000000-0000-0000-0000-000000000001 (seeded),
--   project d0000000-0000-0000-0000-00000000000a, owner 00000001-...01

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000000',
  format('7%s000000-0000-0000-0000-00000000000%s', s, n)::uuid,
  'authenticated', 'authenticated',
  format('upload-limits-%s-%s@demo.clientdesk.invalid', s, n),
  '{}', '{}', now(), now()
FROM generate_series(1, 3) AS s, generate_series(1, 4) AS n;

-- Sandboxes left in a development database would count toward the caps the
-- clone checks; this transaction starts from an empty registry.
DELETE FROM public.demo_sandboxes;

CREATE TEMP TABLE clone_a AS
  SELECT public.create_demo_sandbox(
    '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004',
    'upload-a'
  ) AS result;
CREATE TEMP TABLE clone_b AS
  SELECT public.create_demo_sandbox(
    '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002',
    '72000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000004',
    'upload-b'
  ) AS result;

CREATE TEMP TABLE clone_c AS
  SELECT public.create_demo_sandbox(
    '73000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000003', '73000000-0000-0000-0000-000000000004',
    'upload-c'
  ) AS result;

CREATE TEMP TABLE ids AS
  SELECT
    (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '73000000-0000-0000-0000-000000000001') AS ws_c,
    (SELECT id FROM public.projects WHERE workspace_id = (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '73000000-0000-0000-0000-000000000001') ORDER BY name LIMIT 1) AS proj_c,
    (SELECT id FROM public.demo_sandboxes WHERE owner_user_id = '71000000-0000-0000-0000-000000000001') AS sandbox_a,
    (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '71000000-0000-0000-0000-000000000001') AS ws_a,
    (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '72000000-0000-0000-0000-000000000001') AS ws_b,
    (SELECT free_workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '72000000-0000-0000-0000-000000000001') AS free_b,
    (SELECT id FROM public.projects WHERE workspace_id = (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '71000000-0000-0000-0000-000000000001') ORDER BY name LIMIT 1) AS proj_a,
    (SELECT id FROM public.projects WHERE workspace_id = (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '72000000-0000-0000-0000-000000000001') ORDER BY name LIMIT 1) AS proj_b,
    (SELECT p.id FROM public.projects p JOIN public.workspace_members m ON m.client_id = p.client_id AND m.workspace_id = p.workspace_id
      WHERE m.user_id = '72000000-0000-0000-0000-000000000003' LIMIT 1) AS proj_b_client,
    (SELECT id FROM public.projects WHERE workspace_id = (SELECT free_workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '72000000-0000-0000-0000-000000000001') LIMIT 1) AS proj_free_b;
GRANT SELECT ON ids TO authenticated;

-- What Storage holds after a browser upload: an object whose metadata has
-- the real size and type. Security definer because the test stands in for the
-- Storage service, which writes this row itself.
CREATE FUNCTION pg_temp.put_object(p_path text, p_size bigint, p_mime text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES ('project-files', p_path, jsonb_build_object('size', p_size, 'mimetype', p_mime));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.put_object(text, bigint, text) TO authenticated;

-- A file row for one sandbox, as the signed-in user would register it after
-- the upload: the object holds p_object_*, the row claims p_row_*.
CREATE FUNCTION pg_temp.register_file(
  p_workspace uuid, p_project uuid, p_user uuid, p_name text,
  p_object_size bigint, p_object_mime text, p_row_size bigint, p_row_mime text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_path text := format('%s/%s/%s/%s', p_workspace, p_project, gen_random_uuid(), p_name);
BEGIN
  PERFORM pg_temp.put_object(v_path, p_object_size, p_object_mime);
  INSERT INTO public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
  VALUES (p_workspace, p_project, p_user, v_path, p_name, p_row_size, p_row_mime);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.register_file(uuid, uuid, uuid, text, bigint, text, bigint, text) TO authenticated;

-- An honest upload: the file row says what the object holds.
CREATE FUNCTION pg_temp.add_file(p_workspace uuid, p_project uuid, p_user uuid, p_name text, p_size bigint, p_mime text)
RETURNS void
LANGUAGE sql
AS $$
  SELECT pg_temp.register_file(p_workspace, p_project, p_user, p_name, p_size, p_mime, p_size, p_mime);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.add_file(uuid, uuid, uuid, text, bigint, text) TO authenticated;

-- Clone --------------------------------------------------------------------

SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids)),
  8,
  'the clone keeps all 8 template files, even the ones over 2 MB or of other types'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids) AND uploaded_in_demo),
  0,
  'cloned files are not marked as uploaded in the demo, so they do not count toward the 5'
);

-- Count -------------------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-0000-0000-000000000001","email":"upload-limits-1-1@demo.clientdesk.invalid","role":"authenticated"}';

SELECT lives_ok(
  $$ select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'one.png', 1000, 'image/png');
     select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'two.jpg', 1000, 'image/jpeg');
     select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'three.webp', 1000, 'image/webp');
     select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'four.gif', 1000, 'image/gif');
     select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'five.pdf', 1000, 'application/pdf') $$,
  'a sandbox accepts 5 uploaded files of the allowed types'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids) AND uploaded_in_demo),
  5,
  'the 5 uploads are marked as uploaded in the demo'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'six.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_count_limit',
  'the 6th uploaded file is refused with CD005 demo_upload_count_limit'
);

-- A client of the sandbox shares the same 5.
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-0000-0000-000000000003","email":"upload-limits-1-3@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000003', 'client.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_count_limit',
  'the limit is per sandbox: a client of the sandbox is refused the 6th file too'
);

-- The limit is on uploads over the sandbox's life, so deleting one frees no slot.
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-0000-0000-000000000001","email":"upload-limits-1-1@demo.clientdesk.invalid","role":"authenticated"}';
DELETE FROM public.project_files
WHERE workspace_id = (SELECT ws_a FROM ids) AND name = 'one.png';
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), (select proj_a from ids), '71000000-0000-0000-0000-000000000001', 'replacement.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_count_limit',
  'deleting an uploaded file does not free a slot'
);

-- Nor does deleting the whole project, which removes every file row in it.
RESET ROLE;
CREATE TEMP TABLE a_client AS SELECT client_id FROM public.projects WHERE id = (SELECT proj_a FROM ids);
DELETE FROM public.projects WHERE id = (SELECT proj_a FROM ids);
SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids) AND uploaded_in_demo),
  0,
  'fixture: deleting the project removed its uploaded file rows'
);
INSERT INTO public.projects (id, workspace_id, client_id, name)
SELECT 'd7000000-0000-0000-0000-0000000000f1', (SELECT ws_a FROM ids), client_id, 'Replacement project'
FROM a_client;
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE sandbox_id = (SELECT sandbox_a FROM ids)),
  5,
  'the ledger still holds the sandbox''s 5 uploads after the project is deleted'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"71000000-0000-0000-0000-000000000001","email":"upload-limits-1-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), 'd7000000-0000-0000-0000-0000000000f1', '71000000-0000-0000-0000-000000000001', 'again.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_count_limit',
  'deleting the project does not reset the sandbox upload limit'
);

-- Size --------------------------------------------------------------------

SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT lives_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'exactly-2mb.png', 2097152, 'image/png') $$,
  'a file of exactly 2 MB (2097152 bytes) is accepted'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'too-big.png', 2097153, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_size_limit',
  'a file one byte over 2 MB is refused with CD005 demo_upload_size_limit'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'huge.pdf', 10485760, 'application/pdf') $$,
  'CD005'::char(5),
  'demo_upload_size_limit',
  'a 10 MiB PDF, allowed by the bucket, is refused in a sandbox'
);

-- Type --------------------------------------------------------------------

SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'notes.txt', 1000, 'text/plain') $$,
  'CD005'::char(5),
  'demo_upload_type_limit',
  'a text file is refused with CD005 demo_upload_type_limit'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'bundle.zip', 1000, 'application/zip') $$,
  'CD005'::char(5),
  'demo_upload_type_limit',
  'a ZIP is refused'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'brief.docx', 1000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') $$,
  'CD005'::char(5),
  'demo_upload_type_limit',
  'an Office document is refused'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'drawing.svg', 1000, 'image/svg+xml') $$,
  'CD005'::char(5),
  'demo_upload_type_limit',
  'an SVG, which can carry script, is refused even though it is an image'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_b FROM ids) AND uploaded_in_demo),
  1,
  'refused files leave no row behind'
);

-- The checks read the object Storage holds, not what the row claims -------

SELECT throws_ok(
  $$ select pg_temp.register_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'forged-type.png', 10485760, 'application/zip', 1, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_type_limit',
  'a row claiming a 1 byte PNG for a 10 MiB ZIP object is refused'
);
SELECT throws_ok(
  $$ select pg_temp.register_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'forged-size.png', 5242880, 'image/png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_size_limit',
  'a row claiming 1000 bytes for a 5 MiB PNG object is refused'
);
SELECT throws_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
     values ((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001',
             format('%s/%s/%s/ghost.png', (select ws_b from ids), (select proj_b from ids), gen_random_uuid()),
             'ghost.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_object_missing',
  'a file row whose object is not in Storage is refused'
);
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES ('project-files',
        format('%s/%s/%s/no-metadata.png', (SELECT ws_b FROM ids), (SELECT proj_b FROM ids), 'e0000000-0000-0000-0000-000000000001'),
        NULL);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
     values ((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001',
             format('%s/%s/%s/no-metadata.png', (select ws_b from ids), (select proj_b from ids), 'e0000000-0000-0000-0000-000000000001'),
             'no-metadata.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_object_missing',
  'a file row whose object has no size or type is refused'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_b FROM ids) AND uploaded_in_demo),
  1,
  'forged and orphaned rows leave nothing behind'
);

-- A client of the sandbox, under the cap, may upload.
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000003","email":"upload-limits-2-3@demo.clientdesk.invalid","role":"authenticated"}';
SELECT lives_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b_client from ids), '72000000-0000-0000-0000-000000000003', 'client-under-cap.png', 1000, 'image/png') $$,
  'a client of the sandbox can upload while the sandbox is under the cap'
);
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';

-- Both workspaces of a sandbox share the 5.
SELECT lives_ok(
  $$ select pg_temp.add_file((select ws_b from ids), (select proj_b from ids), '72000000-0000-0000-0000-000000000001', 'b3.png', 1000, 'image/png');
     select pg_temp.add_file((select free_b from ids), (select proj_free_b from ids), '72000000-0000-0000-0000-000000000001', 'b4.png', 1000, 'image/png');
     select pg_temp.add_file((select free_b from ids), (select proj_free_b from ids), '72000000-0000-0000-0000-000000000001', 'b5.png', 1000, 'image/png') $$,
  'sandbox B reaches 5 uploads across its two workspaces'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select free_b from ids), (select proj_free_b from ids), '72000000-0000-0000-0000-000000000001', 'b6.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_count_limit',
  'the Free workspace of a sandbox is refused once the sandbox holds 5 uploads'
);

-- Outside a sandbox -------------------------------------------------------

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ select pg_temp.add_file('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', '00000001-0000-0000-0000-000000000001', 'big.zip', 5242880, 'application/zip') $$,
  'a workspace outside a sandbox still accepts a 5 MB ZIP'
);

-- Storage -----------------------------------------------------------------

-- Sandbox C holds 8 template copies in Storage once the server has copied
-- the blobs (the pgTAP clone has none, so they are added here as postgres).
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, owner_id)
SELECT 'project-files',
       format('%s/%s/%s/template-%s.png', (SELECT ws_c FROM ids), (SELECT proj_c FROM ids), gen_random_uuid(), g),
       NULL
FROM generate_series(1, 8) AS g;

-- An object cannot be swapped after the file is registered: the owner may
-- delete the object (the delete policy allows it) but the name stays taken by
-- the file row, so a different payload cannot be put under it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"73000000-0000-0000-0000-000000000001","email":"upload-limits-3-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT lives_ok(
  $$ select pg_temp.add_file((select ws_c from ids), (select proj_c from ids), '73000000-0000-0000-0000-000000000001', 'swap.png', 1000, 'image/png') $$,
  'fixture: a file is registered in sandbox C'
);
CREATE TEMP TABLE swap AS
  SELECT storage_path FROM public.project_files
  WHERE workspace_id = (SELECT ws_c FROM ids) AND name = 'swap.png';
GRANT SELECT ON swap TO authenticated;
-- Storage deletes through its API, which lifts the guard on direct deletes
-- for the statement; the test lifts it the same way.
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.objects WHERE bucket_id = 'project-files' AND name = (SELECT storage_path FROM swap);
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE name = (SELECT storage_path FROM swap)),
  0,
  'fixture: the owner deleted the registered object'
);
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files', (select storage_path from swap), '73000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an object cannot be put back under the name of a registered file'
);

SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'project-files',
            format('%s/%s/%s/upload-%s.png', (select ws_c from ids), (select proj_c from ids), gen_random_uuid(), g),
            '73000000-0000-0000-0000-000000000001'
     from generate_series(1, 4) as g $$,
  'a sandbox may add 4 objects on top of its template copies'
);

-- With one slot still free, an upper case workspace id is refused: the reason
-- is the canonical path rule, not the cap.
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/upper.png', upper((select ws_c from ids)::text), (select proj_c from ids), gen_random_uuid()),
             '73000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an upper case workspace id is refused while the sandbox still has a free slot'
);
SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/last.png', (select ws_c from ids), (select proj_c from ids), gen_random_uuid()),
             '73000000-0000-0000-0000-000000000001') $$,
  'the 5th extra object, up to the cap, is accepted'
);
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/one-too-many.png', (select ws_c from ids), (select proj_c from ids), gen_random_uuid()),
             '73000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'a canonical direct upload past the sandbox object cap is refused'
);

-- Canonical paths are required inside a sandbox even with room to spare
-- (sandbox B holds no direct uploads).
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/upper.png', upper((select ws_b from ids)::text), (select proj_b from ids), gen_random_uuid()),
             '72000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'an upper case workspace id is refused inside a sandbox with room left'
);
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/extra/segment.png', (select ws_b from ids), (select proj_b from ids), gen_random_uuid()),
             '72000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'a path with more than 4 segments is refused inside a sandbox'
);
SELECT throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/not-a-uuid/file.png', (select ws_b from ids), (select proj_b from ids)),
             '72000000-0000-0000-0000-000000000001') $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'a file id segment that is not a UUID is refused inside a sandbox'
);
SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('project-files',
             format('%s/%s/%s/canonical.png', (select ws_b from ids), (select proj_b from ids), gen_random_uuid()),
             '72000000-0000-0000-0000-000000000001') $$,
  'a canonical path inside a sandbox with room left is accepted'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     select 'project-files',
            format('a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/%s/bulk-%s.zip', gen_random_uuid(), g),
            '00000001-0000-0000-0000-000000000001'
     from generate_series(1, 20) as g $$,
  'a workspace outside a sandbox is not held to the object cap'
);

-- Non-members and foreign paths -------------------------------------------

-- A user of sandbox B writing into sandbox A's workspace is not a member
-- there: row level security answers, not a limit message that would reveal
-- how many uploads sandbox A has used.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), 'd7000000-0000-0000-0000-0000000000f1', '72000000-0000-0000-0000-000000000001', 'intruder.png', 1000, 'image/png') $$,
  '42501',
  'new row violates row-level security policy for table "project_files"',
  'a non-member gets the row level security error, not a demo limit error'
);
SELECT throws_ok(
  $$ select pg_temp.add_file((select ws_a from ids), 'd7000000-0000-0000-0000-0000000000f1', '72000000-0000-0000-0000-000000000001', 'intruder-over.png', 99999999, 'application/zip') $$,
  '42501',
  'new row violates row-level security policy for table "project_files"',
  'a non-member learns nothing about size or type limits either'
);

-- A member's row must point into its own workspace and project.
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
     values ((select free_b from ids), (select proj_free_b from ids), '72000000-0000-0000-0000-000000000001',
             format('%s/%s/%s/borrowed.png', (select ws_b from ids), (select proj_free_b from ids), gen_random_uuid()),
             'borrowed.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_path_invalid',
  'a row whose path starts with another workspace id is refused'
);
SELECT throws_ok(
  $$ insert into public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
     values ((select free_b from ids), (select proj_free_b from ids), '72000000-0000-0000-0000-000000000001',
             format('%s/%s/%s/borrowed.png', (select free_b from ids), (select proj_b from ids), gen_random_uuid()),
             'borrowed.png', 1000, 'image/png') $$,
  'CD005'::char(5),
  'demo_upload_path_invalid',
  'a row whose path names another project is refused'
);

-- The storage insert check ------------------------------------------------

RESET ROLE;
SELECT is(
  (SELECT provolatile FROM pg_proc WHERE oid = 'private.demo_storage_insert_allowed(text)'::regprocedure),
  'v'::"char",
  'demo_storage_insert_allowed is volatile, so each call sees the objects other transactions just committed'
);
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE oid = 'private.demo_storage_insert_allowed(text)'::regprocedure) LIKE '%pg_advisory_xact_lock%',
  'demo_storage_insert_allowed takes an advisory lock before it counts'
);

-- Ledger and grants -----------------------------------------------------

RESET ROLE;
SELECT ok(
  NOT has_table_privilege('anon', 'public.demo_upload_usage', 'SELECT, INSERT, UPDATE, DELETE')
    AND NOT has_table_privilege('authenticated', 'public.demo_upload_usage', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.demo_upload_usage', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.demo_upload_usage', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.demo_upload_usage', 'DELETE'),
  'anon and authenticated have no privileges on demo_upload_usage'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.demo_upload_usage'::regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'demo_upload_usage'),
  'demo_upload_usage has row level security on and no policy'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.demo_upload_usage'::regclass AND contype = 'f'
  ),
  'demo_upload_usage has no foreign keys, so nothing a visitor deletes can reach it'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.project_files', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.project_files', 'UPDATE')
    AND NOT has_any_column_privilege('authenticated', 'public.project_files', 'UPDATE'),
  'no API role can update project_files, so uploaded_in_demo cannot be flipped'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"72000000-0000-0000-0000-000000000001","email":"upload-limits-2-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ update public.project_files set uploaded_in_demo = false where workspace_id = (select ws_b from ids) $$,
  '42501',
  'permission denied for table project_files',
  'a signed-in user cannot reset uploaded_in_demo'
);

SELECT * FROM finish();
ROLLBACK;
