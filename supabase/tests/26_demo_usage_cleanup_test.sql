-- The demo usage ledgers and what the cleanup does with them, plus the two
-- RPCs the pages read: demo_uploads_used (uploads used in a sandbox) and
-- get_sandbox_billing (which half of a sandbox a workspace is).
--
-- demo_upload_usage goes when finish_demo_sandbox_cleanup finishes the
-- sandbox. demo_ai_usage is the daily budget, so it is pruned by age (48
-- hours) in delete_expired_demo_sandboxes and by nothing else; the upload
-- ledger is pruned by age (48 hours) there too, as a backstop for rows whose
-- sandbox was never finished. The cleanup also collects every object under
-- the sandbox's workspace prefixes, with or without a file row.
BEGIN;
SELECT plan(30);

-- sandbox X: users 74000000-...01 (owner) .. 04, expired and cleaned up
-- sandbox Y: users 75000000-...01 .. 04, live
-- outsider (real user, in no sandbox): 00000009-...09 (seeded)

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000000',
  format('7%s000000-0000-0000-0000-00000000000%s', s, n)::uuid,
  'authenticated', 'authenticated',
  format('usage-cleanup-%s-%s@demo.clientdesk.invalid', s, n),
  '{}', '{}', now(), now()
FROM generate_series(4, 5) AS s, generate_series(1, 4) AS n;

DELETE FROM public.demo_sandboxes;
DELETE FROM public.demo_ai_usage;
DELETE FROM public.demo_upload_usage;

CREATE TEMP TABLE clone_x AS
  SELECT public.create_demo_sandbox(
    '74000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000002',
    '74000000-0000-0000-0000-000000000003', '74000000-0000-0000-0000-000000000004',
    'cleanup-x'
  ) AS result;
CREATE TEMP TABLE clone_y AS
  SELECT public.create_demo_sandbox(
    '75000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000002',
    '75000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000004',
    'cleanup-y'
  ) AS result;

CREATE TEMP TABLE ids AS
  SELECT
    x.id AS sandbox_x, x.workspace_id AS ws_x, x.free_workspace_id AS free_x,
    y.id AS sandbox_y, y.workspace_id AS ws_y, y.free_workspace_id AS free_y,
    (SELECT slug FROM public.workspaces WHERE id = y.free_workspace_id) AS free_y_slug,
    (SELECT id FROM public.projects WHERE workspace_id = y.workspace_id ORDER BY name LIMIT 1) AS proj_y
  FROM public.demo_sandboxes x, public.demo_sandboxes y
  WHERE x.owner_user_id = '74000000-0000-0000-0000-000000000001'
    AND y.owner_user_id = '75000000-0000-0000-0000-000000000001';
GRANT SELECT ON ids TO authenticated;

-- Objects under sandbox X: one with a file row, one orphan, one in the Free
-- workspace, and one in a workspace that is not part of the sandbox, which
-- must stay out of the list. (Sandbox paths are canonical, lower case, so the
-- cleanup matches the prefix as is.)
INSERT INTO storage.objects (bucket_id, name)
SELECT 'project-files', format('%s/%s/%s/orphan.png', (SELECT ws_x FROM ids), gen_random_uuid(), gen_random_uuid());
INSERT INTO storage.objects (bucket_id, name)
SELECT 'project-files', format('%s/%s/%s/free-orphan.png', (SELECT free_x FROM ids), gen_random_uuid(), gen_random_uuid());
INSERT INTO storage.objects (bucket_id, name)
VALUES ('project-files', format('%s/%s/%s/other.png', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()));

-- Ledger rows: sandbox X has 2 uploads and 3 AI claims, sandbox Y 1 upload.
INSERT INTO public.demo_upload_usage (sandbox_id)
SELECT (SELECT sandbox_x FROM ids) FROM generate_series(1, 2);
INSERT INTO public.demo_upload_usage (sandbox_id) SELECT sandbox_y FROM ids;
-- Rows of sandboxes that are gone (one over 48 hours old, one of 72), plus a
-- recent one of a sandbox that never finished its cleanup.
INSERT INTO public.demo_upload_usage (sandbox_id, created_at)
VALUES
  (gen_random_uuid(), now() - interval '49 hours'),
  (gen_random_uuid(), now() - interval '72 hours'),
  (gen_random_uuid(), now() - interval '47 hours');
INSERT INTO public.demo_ai_usage (sandbox_id, created_at)
VALUES
  ((SELECT sandbox_x FROM ids), now() - interval '1 hour'),
  ((SELECT sandbox_x FROM ids), now() - interval '47 hours'),
  ((SELECT sandbox_x FROM ids), now() - interval '49 hours'),
  ((SELECT sandbox_y FROM ids), now() - interval '72 hours');

-- Grants -------------------------------------------------------------------

SELECT ok(
  has_function_privilege('authenticated', 'public.demo_uploads_used(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.demo_uploads_used(uuid)', 'EXECUTE'),
  'demo_uploads_used is executable by authenticated and not by anon'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_sandbox_billing(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_sandbox_billing(uuid)', 'EXECUTE'),
  'get_sandbox_billing is executable by authenticated and not by anon'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_sandbox_billing(uuid)'::regprocedure),
  'get_sandbox_billing is security invoker, so row level security applies'
);

-- demo_uploads_used ----------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"75000000-0000-0000-0000-000000000001","email":"usage-cleanup-5-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT is(
  (SELECT public.demo_uploads_used((SELECT ws_y FROM ids))),
  1,
  'demo_uploads_used counts the sandbox''s uploads from the Pro workspace'
);
SELECT is(
  (SELECT public.demo_uploads_used((SELECT free_y FROM ids))),
  1,
  'demo_uploads_used gives the same count from the Free workspace'
);
SELECT is(
  (SELECT public.demo_uploads_used('a0000000-0000-0000-0000-000000000001')),
  NULL,
  'demo_uploads_used is null for a workspace the caller is not in'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT public.demo_uploads_used('a0000000-0000-0000-0000-000000000001')),
  NULL,
  'demo_uploads_used is null for a member''s workspace outside any sandbox'
);
SELECT is(
  (SELECT public.demo_uploads_used((SELECT ws_y FROM ids))),
  NULL,
  'demo_uploads_used does not tell a non-member how many uploads a sandbox used'
);
SET LOCAL request.jwt.claims TO '{"sub":"75000000-0000-0000-0000-000000000003","email":"usage-cleanup-5-3@demo.clientdesk.invalid","role":"authenticated"}';
SELECT is(
  (SELECT public.demo_uploads_used((SELECT ws_y FROM ids))),
  1,
  'a client of the sandbox can read the count too'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ select public.demo_uploads_used('a0000000-0000-0000-0000-000000000001') $$,
  '42501',
  'permission denied for function demo_uploads_used',
  'anon cannot call demo_uploads_used'
);

-- get_sandbox_billing ---------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"75000000-0000-0000-0000-000000000001","email":"usage-cleanup-5-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT results_eq(
  $$ select kind, free_slug from public.get_sandbox_billing((select ws_y from ids)) $$,
  $$ select 'pro'::text, (select free_y_slug from ids) $$,
  'the Pro workspace of a sandbox is pro and carries the Free workspace slug'
);
SELECT results_eq(
  $$ select kind, free_slug from public.get_sandbox_billing((select free_y from ids)) $$,
  $$ values ('free'::text, null::text) $$,
  'the Free workspace of a sandbox is free, with no slug'
);
SELECT is_empty(
  $$ select * from public.get_sandbox_billing('a0000000-0000-0000-0000-000000000001') $$,
  'a workspace outside a sandbox gives no row'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select * from public.get_sandbox_billing((select ws_y from ids)) $$,
  'a user outside the sandbox gets no row for it (row level security applies)'
);

-- Cleanup ---------------------------------------------------------------------

RESET ROLE;
-- A registered file in sandbox X, so the list holds a path from a file row too.
INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'project-files',
       format('%s/%s/%s/registered.png', (SELECT ws_x FROM ids), p.id, 'f0000000-0000-0000-0000-000000000001'),
       '{"size": 1000, "mimetype": "image/png"}'
FROM public.projects p WHERE p.workspace_id = (SELECT ws_x FROM ids) ORDER BY p.id LIMIT 1;
INSERT INTO public.project_files (workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type)
SELECT (SELECT ws_x FROM ids), p.id, '74000000-0000-0000-0000-000000000001',
       format('%s/%s/%s/registered.png', (SELECT ws_x FROM ids), p.id, 'f0000000-0000-0000-0000-000000000001'),
       'registered.png', 1000, 'image/png'
FROM public.projects p WHERE p.workspace_id = (SELECT ws_x FROM ids) ORDER BY p.id LIMIT 1;

UPDATE public.demo_sandboxes SET expires_at = now() - interval '1 hour'
WHERE id = (SELECT sandbox_x FROM ids);

-- File rows (cloned from the template, plus the registered one) plus the 2
-- objects with no row.
CREATE TEMP TABLE expected AS
  SELECT (SELECT count(*) FROM public.project_files WHERE workspace_id IN (SELECT ws_x FROM ids UNION SELECT free_x FROM ids))::int + 2 AS paths;

CREATE TEMP TABLE swept AS SELECT public.delete_expired_demo_sandboxes() AS result;

SELECT ok(
  (SELECT s.pending_storage_paths @> ARRAY[
      (SELECT name FROM storage.objects WHERE name LIKE '%/orphan.png' AND name LIKE (SELECT ws_x FROM ids)::text || '/%'),
      (SELECT name FROM storage.objects WHERE name LIKE '%/free-orphan.png'),
      (SELECT name FROM storage.objects WHERE name LIKE '%/registered.png')
    ]
   FROM public.demo_sandboxes s WHERE s.id = (SELECT sandbox_x FROM ids)),
  'the cleanup collects orphaned and direct uploads in both workspaces, plus registered files'
);
SELECT is(
  (SELECT cardinality(s.pending_storage_paths) FROM public.demo_sandboxes s WHERE s.id = (SELECT sandbox_x FROM ids)),
  (SELECT paths FROM expected),
  'the list holds only objects under the sandbox''s own workspaces, each once'
);
SELECT is(
  (SELECT jsonb_array_length(e -> 'storage_paths')
   FROM swept, jsonb_array_elements(swept.result -> 'sandboxes') e
   WHERE e ->> 'id' = (SELECT sandbox_x FROM ids)::text),
  (SELECT paths FROM expected),
  'the same paths are returned to the server for removal'
);

SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE sandbox_id = (SELECT sandbox_x FROM ids)),
  2,
  'the cleanup prunes AI ledger rows older than 48 hours and keeps the rest'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE sandbox_id = (SELECT sandbox_y FROM ids)),
  0,
  'an old AI ledger row of a live sandbox is pruned as well'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE sandbox_id = (SELECT sandbox_x FROM ids)),
  2,
  'deleting the workspaces leaves the sandbox''s 2 upload ledger rows until the cleanup is finished'
);

SELECT is(
  public.finish_demo_sandbox_cleanup(ARRAY[(SELECT sandbox_x FROM ids)]),
  1,
  'finish_demo_sandbox_cleanup removes the finished sandbox'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE sandbox_id = (SELECT sandbox_x FROM ids)),
  0,
  'finishing the cleanup removes the sandbox''s upload ledger rows'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE sandbox_id = (SELECT sandbox_y FROM ids)),
  1,
  'another sandbox''s upload ledger rows stay'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE sandbox_id = (SELECT sandbox_x FROM ids)),
  2,
  'finishing the cleanup leaves the AI ledger: the daily budget does not depend on the sandbox'
);

-- The 48 hour prune does not depend on deleting a sandbox.
INSERT INTO public.demo_ai_usage (sandbox_id, created_at)
VALUES (gen_random_uuid(), now() - interval '50 hours'), (gen_random_uuid(), now() - interval '2 hours');
SELECT public.delete_expired_demo_sandboxes();
SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE created_at < now() - interval '48 hours'),
  0,
  'a cleanup run with no expired sandbox still prunes ledger rows older than 48 hours'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_ai_usage WHERE created_at > now() - interval '3 hours'),
  2,
  'rows inside the window survive the prune'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE created_at < now() - interval '48 hours'),
  0,
  'the cleanup prunes upload ledger rows older than 48 hours, whatever sandbox they belong to'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_upload_usage WHERE created_at > now() - interval '48 hours'),
  2,
  'upload ledger rows inside 48 hours survive the prune (sandbox Y''s recent row and the unfinished one)'
);
SELECT ok(
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'demo_upload_usage' AND indexdef ILIKE '%(sandbox_id)%') >= 1,
  'the per-sandbox upload count has an index on sandbox_id'
);
SELECT ok(
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'demo_ai_usage' AND indexdef ILIKE '%(sandbox_id)%') >= 1,
  'the per-sandbox AI count has an index on sandbox_id'
);
SELECT * FROM finish();
ROLLBACK;
