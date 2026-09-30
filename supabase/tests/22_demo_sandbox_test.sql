-- Demo sandboxes: public.create_demo_sandbox copies the Northwind template
-- (supabase/demo/template.sql) into a private workspace per visitor, and
-- public.delete_expired_demo_sandboxes removes the ones past expires_at.
-- Covers the clone's shape, re-anchored timestamps, the pinned Pro plan and
-- the second Free workspace, isolation between sandboxes and from the
-- template, EXECUTE grants (service_role only), the three caps, and expiry.
--
-- Runs as the privileged role, like the server does with the secret key,
-- except where a test switches to `authenticated` on purpose.
BEGIN;
SELECT plan(119);

-- template workspace: 30000000-0000-0000-0000-000000000001
-- sandbox A users: owner 41000000-...01, member 02, client one 03, client two 04
-- sandbox B users: owner 42000000-...01, member 02, client one 03, client two 04
-- sandboxes C and D (cap tests): the same shape under 43000000 and 44000000.
-- Every sandbox needs its own users: the four user columns are unique.
-- outsider (seeded, not in any sandbox): 00000009-0000-0000-0000-000000000009

-- Fixture: the users the server creates through the admin API before it
-- calls the clone function. The insert fires handle_new_user, so each one
-- gets a profile without a name.
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000000',
  format('4%s000000-0000-0000-0000-00000000000%s', s, n)::uuid,
  'authenticated', 'authenticated',
  format('sandbox-%s-%s@demo.clientdesk.invalid', s, n),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now()
FROM generate_series(1, 4) AS s, generate_series(1, 4) AS n;

-- Sandboxes left in a development database (by e2e runs, or by hand) would
-- count toward the caps and the counts below. This transaction starts from an
-- empty registry; the ROLLBACK at the end puts them back.
DELETE FROM public.demo_sandboxes;

-- A helper for the cap tests: n fake sandboxes for one visitor, each with a
-- bare workspace so the unique foreign key holds.
CREATE FUNCTION pg_temp.fake_sandboxes(p_count int, p_hash text, p_created_ago interval, p_ttl interval)
RETURNS void
LANGUAGE sql
AS $$
  WITH w AS (
    INSERT INTO public.workspaces (name, slug)
    SELECT 'Fake sandbox', 'fake-' || gen_random_uuid()::text
    FROM generate_series(1, p_count)
    RETURNING id
  )
  INSERT INTO public.demo_sandboxes (
    workspace_id, owner_user_id, member_user_id, client_one_user_id, client_two_user_id,
    visitor_hash, created_at, expires_at
  )
  SELECT id, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    p_hash, now() - p_created_ago, now() - p_created_ago + p_ttl
  FROM w;
$$;

-- Removes the fake sandboxes and their bare workspaces. Deleting only the
-- workspaces would leave the registry rows behind (the FK is set null), and
-- those would keep counting toward the caps.
CREATE FUNCTION pg_temp.drop_fakes()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.demo_sandboxes
  WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE name = 'Fake sandbox');
  DELETE FROM public.workspaces WHERE name = 'Fake sandbox';
$$;

-- Grants ---------------------------------------------------------------

SELECT ok(
  NOT has_function_privilege('anon', 'public.create_demo_sandbox(uuid, uuid, uuid, uuid, text)', 'EXECUTE'),
  'anon cannot execute create_demo_sandbox'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.create_demo_sandbox(uuid, uuid, uuid, uuid, text)', 'EXECUTE'),
  'authenticated cannot execute create_demo_sandbox'
);
SELECT ok(
  has_function_privilege('service_role', 'public.create_demo_sandbox(uuid, uuid, uuid, uuid, text)', 'EXECUTE'),
  'service_role can execute create_demo_sandbox'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_expired_demo_sandboxes()', 'EXECUTE'),
  'anon cannot execute delete_expired_demo_sandboxes'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.delete_expired_demo_sandboxes()', 'EXECUTE'),
  'authenticated cannot execute delete_expired_demo_sandboxes'
);
SELECT ok(
  has_function_privilege('service_role', 'public.delete_expired_demo_sandboxes()', 'EXECUTE'),
  'service_role can execute delete_expired_demo_sandboxes'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.finish_demo_sandbox_cleanup(uuid[])', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.finish_demo_sandbox_cleanup(uuid[])', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.finish_demo_sandbox_cleanup(uuid[])', 'EXECUTE'),
  'only service_role can execute finish_demo_sandbox_cleanup'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.demo_can_start(text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.demo_can_start(text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.demo_can_start(text)', 'EXECUTE'),
  'only service_role can execute demo_can_start'
);
SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p, LATERAL aclexplode(p.proacl) a
   WHERE p.oid IN (
       'public.create_demo_sandbox(uuid, uuid, uuid, uuid, text)'::regprocedure,
       'public.delete_expired_demo_sandboxes()'::regprocedure,
       'public.finish_demo_sandbox_cleanup(uuid[])'::regprocedure,
       'public.demo_can_start(text)'::regprocedure
     )
     AND a.grantee = 0),
  0,
  'no demo function keeps the implicit PUBLIC execute grant'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.create_demo_sandbox('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004', 'v') $$,
  '42501',
  'permission denied for function create_demo_sandbox',
  'a signed-in user calling create_demo_sandbox is refused'
);
SELECT throws_ok(
  $$ select public.delete_expired_demo_sandboxes() $$,
  '42501',
  'permission denied for function delete_expired_demo_sandboxes',
  'a signed-in user calling delete_expired_demo_sandboxes is refused'
);
SELECT throws_ok(
  $$ select public.finish_demo_sandbox_cleanup(ARRAY[gen_random_uuid()]) $$,
  '42501',
  'permission denied for function finish_demo_sandbox_cleanup',
  'a signed-in user calling finish_demo_sandbox_cleanup is refused'
);
SELECT throws_ok(
  $$ select public.demo_can_start('v') $$,
  '42501',
  'permission denied for function demo_can_start',
  'a signed-in user calling demo_can_start is refused'
);
RESET ROLE;

-- Clone ----------------------------------------------------------------

CREATE TEMP TABLE clone_a AS
  SELECT public.create_demo_sandbox(
    '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004',
    'hash-a'
  ) AS result;
CREATE TEMP TABLE clone_b AS
  SELECT public.create_demo_sandbox(
    '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002',
    '42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000004',
    'hash-b'
  ) AS result;

CREATE TEMP TABLE ids AS
  SELECT
    (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '41000000-0000-0000-0000-000000000001') AS ws_a,
    (SELECT free_workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '41000000-0000-0000-0000-000000000001') AS free_a,
    (SELECT workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '42000000-0000-0000-0000-000000000001') AS ws_b,
    (SELECT free_workspace_id FROM public.demo_sandboxes WHERE owner_user_id = '42000000-0000-0000-0000-000000000001') AS free_b;
-- The isolation checks below read this table while acting as a signed-in user.
GRANT SELECT ON ids TO authenticated;

SELECT is((SELECT count(*)::int FROM public.demo_sandboxes), 2, 'each clone records one sandbox');
SELECT is((SELECT result ->> 'workspace_id' FROM clone_a), (SELECT ws_a::text FROM ids), 'the result names the Pro workspace id');
SELECT is((SELECT result ->> 'free_workspace_id' FROM clone_a), (SELECT free_a::text FROM ids), 'the result names the Free workspace id');
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = (SELECT ws_a FROM ids)),
  'Northwind Studio',
  'the clone keeps the template name'
);
SELECT ok(
  (SELECT slug FROM public.workspaces WHERE id = (SELECT ws_a FROM ids)) ~ '^northwind-[0-9a-f]{6}$',
  'the clone gets a unique northwind-<random> slug'
);
SELECT is(
  (SELECT result ->> 'workspace_slug' FROM clone_a),
  (SELECT slug FROM public.workspaces WHERE id = (SELECT ws_a FROM ids)),
  'the result carries the slug'
);
SELECT isnt(
  (SELECT slug FROM public.workspaces WHERE id = (SELECT ws_a FROM ids)),
  (SELECT slug FROM public.workspaces WHERE id = (SELECT ws_b FROM ids)),
  'two clones never share a slug'
);

SELECT is((SELECT count(*)::int FROM public.clients WHERE workspace_id = (SELECT ws_a FROM ids)), 5, 'the clone has 5 clients');
SELECT is((SELECT count(*)::int FROM public.projects WHERE workspace_id = (SELECT ws_a FROM ids)), 10, 'the clone has 10 projects');
SELECT is((SELECT count(*)::int FROM public.project_updates WHERE workspace_id = (SELECT ws_a FROM ids)), 18, 'the clone has 18 updates');
SELECT is((SELECT count(*)::int FROM public.update_comments WHERE workspace_id = (SELECT ws_a FROM ids)), 10, 'the clone has 10 comments');
SELECT is((SELECT count(*)::int FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids)), 8, 'the clone has 8 file rows');
SELECT is((SELECT count(*)::int FROM public.workspace_members WHERE workspace_id = (SELECT ws_a FROM ids)), 4, 'the clone has 4 members');
SELECT is(
  (SELECT count(*)::int FROM public.projects p
   WHERE p.workspace_id = (SELECT ws_a FROM ids)
     AND p.id::text LIKE '33000000-%'),
  0,
  'no clone project reuses a template id'
);
SELECT is(
  (SELECT count(*)::int FROM public.update_comments c
   JOIN public.project_updates u ON u.id = c.update_id AND u.project_id = c.project_id
   WHERE c.workspace_id = (SELECT ws_a FROM ids)),
  10,
  'every clone comment points at a clone update on the same project'
);

-- Members map to the given users by role and by client.
SELECT is(
  (SELECT array_agg(user_id::text ORDER BY user_id) FROM public.workspace_members WHERE workspace_id = (SELECT ws_a FROM ids)),
  ARRAY[
    '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004'
  ],
  'the clone members are exactly the four given users'
);
SELECT is(
  (SELECT role::text FROM public.workspace_members WHERE workspace_id = (SELECT ws_a FROM ids) AND user_id = '41000000-0000-0000-0000-000000000001'),
  'owner',
  'the first user is the owner'
);
SELECT is(
  (SELECT c.name FROM public.workspace_members m JOIN public.clients c ON c.id = m.client_id
   WHERE m.workspace_id = (SELECT ws_a FROM ids) AND m.user_id = '41000000-0000-0000-0000-000000000003'),
  'Acme Bakery',
  'client user one belongs to Acme Bakery'
);
SELECT is(
  (SELECT c.name FROM public.workspace_members m JOIN public.clients c ON c.id = m.client_id
   WHERE m.workspace_id = (SELECT ws_a FROM ids) AND m.user_id = '41000000-0000-0000-0000-000000000004'),
  'Lumen Dental',
  'client user two belongs to Lumen Dental'
);
-- count(*) filter, not NOT IN: a NULL author would pass a NOT IN check.
SELECT is(
  (SELECT count(*) FILTER (WHERE author_id IN ('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002'))::int
   FROM public.project_updates WHERE workspace_id = (SELECT ws_a FROM ids)),
  18,
  'every clone update is authored by the sandbox owner or member'
);
SELECT is(
  (SELECT count(*) FILTER (WHERE uploaded_by IN (
     '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002',
     '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004'))::int
   FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids)),
  8,
  'every clone file is uploaded by one of the four sandbox users'
);
SELECT is(
  (SELECT count(*) FILTER (WHERE uploaded_by = '41000000-0000-0000-0000-000000000001')::int * 100
        + count(*) FILTER (WHERE uploaded_by = '41000000-0000-0000-0000-000000000002')::int * 10
        + count(*) FILTER (WHERE uploaded_by = '41000000-0000-0000-0000-000000000003')::int
   FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids)),
  431,
  'the template uploaders map to the sandbox users: owner 4, member 3, client one 1'
);
SELECT is(
  (SELECT count(*) FILTER (WHERE author_id IN (
     '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002',
     '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004'))::int
   FROM public.update_comments WHERE workspace_id = (SELECT ws_a FROM ids)),
  10,
  'every clone comment is written by one of the four sandbox users'
);
SELECT is(
  (SELECT count(*)::int FROM public.update_comments
   WHERE workspace_id = (SELECT ws_a FROM ids)
     AND author_id = '41000000-0000-0000-0000-000000000003'),
  3,
  'the comments Priya wrote in the template are written by client user one'
);
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '41000000-0000-0000-0000-000000000001'),
  'Maya Chen',
  'the sandbox owner profile carries the template name'
);

-- Timestamps -----------------------------------------------------------

SELECT is(
  (SELECT count(*)::int FROM public.project_updates
   WHERE workspace_id = (SELECT ws_a FROM ids) AND created_at > now() - interval '7 days'),
  14,
  'the clone shows 14 updates from the last 7 days'
);
SELECT is(
  (SELECT max(created_at) FROM public.project_updates WHERE workspace_id = (SELECT ws_a FROM ids)),
  now() - interval '2 hours',
  'the newest clone update is 2 hours old, as in the template'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_updates WHERE workspace_id = (SELECT ws_a FROM ids) AND created_at > now()),
  0,
  'no clone update is in the future'
);

-- Every cloned table keeps the template's offsets: the offset of a clone row
-- from now() equals the offset of its template row from the anchor. Sorted
-- offsets are compared, so a row cannot move without the test noticing.
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.workspaces WHERE id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(w.created_at - d.anchor ORDER BY w.created_at) FROM public.workspaces w, public.demo_template d WHERE w.id = d.workspace_id),
  'the clone workspace keeps the template offset'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.clients WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.clients x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone clients keep the template offsets'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.projects WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.projects x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone projects keep the template offsets'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.project_updates WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.project_updates x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone updates keep the template offsets'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.update_comments WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.update_comments x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone comments keep the template offsets'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.project_files WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.project_files x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone files keep the template offsets'
);
SELECT is(
  (SELECT array_agg(created_at - now() ORDER BY created_at) FROM public.workspace_members WHERE workspace_id = (SELECT ws_a FROM ids)),
  (SELECT array_agg(x.created_at - d.anchor ORDER BY x.created_at) FROM public.workspace_members x, public.demo_template d WHERE x.workspace_id = d.workspace_id),
  'the clone members keep the template offsets'
);

-- Files ----------------------------------------------------------------

SELECT is(
  (SELECT count(*)::int FROM public.project_files
   WHERE workspace_id = (SELECT ws_a FROM ids)
     AND storage_path <> workspace_id || '/' || project_id || '/' || id || '/' || name),
  0,
  'every clone file path follows workspace/project/file/name'
);
SELECT is(
  (SELECT jsonb_array_length(result -> 'files') FROM clone_a),
  8,
  'the result maps all 8 template file paths'
);
SELECT is(
  (SELECT count(*)::int FROM clone_a, jsonb_array_elements(result -> 'files') f
   WHERE EXISTS (SELECT 1 FROM public.project_files t WHERE t.storage_path = f ->> 'from' AND t.workspace_id = '30000000-0000-0000-0000-000000000001')
     AND EXISTS (SELECT 1 FROM public.project_files c WHERE c.storage_path = f ->> 'to' AND c.workspace_id = (SELECT ws_a FROM ids))),
  8,
  'each mapped path goes from a template file to a clone file'
);

-- Plan -----------------------------------------------------------------

SELECT is(private.workspace_plan((SELECT ws_a FROM ids)), 'pro', 'the sandbox workspace is on Pro');
SELECT is(
  (SELECT count(*)::int FROM public.workspace_billing
   WHERE workspace_id = (SELECT ws_a FROM ids) AND stripe_customer_id IS NULL AND subscription_status = 'active'),
  1,
  'the Pro plan is pinned with no Stripe customer'
);
SELECT is(
  (SELECT name FROM public.workspaces WHERE id = (SELECT free_a FROM ids)),
  'Northwind Labs',
  'the second workspace is Northwind Labs'
);
SELECT is(private.workspace_plan((SELECT free_a FROM ids)), 'free', 'the second workspace is on Free');
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members
   WHERE workspace_id = (SELECT free_a FROM ids) AND user_id = '41000000-0000-0000-0000-000000000001' AND role = 'owner'),
  1,
  'the sandbox owner owns Northwind Labs'
);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = (SELECT free_a FROM ids)) * 10
    + (SELECT count(*)::int FROM public.projects WHERE workspace_id = (SELECT free_a FROM ids)),
  11,
  'Northwind Labs has one client and one project'
);

-- Registry --------------------------------------------------------------

SELECT is(
  (SELECT expires_at FROM public.demo_sandboxes WHERE workspace_id = (SELECT ws_a FROM ids)),
  now() + interval '24 hours',
  'a sandbox expires 24 hours after it is created'
);
SELECT ok(private.is_demo_workspace((SELECT ws_a FROM ids)), 'the Pro sandbox workspace is a demo workspace');
SELECT ok(private.is_demo_workspace((SELECT free_a FROM ids)), 'the Free sandbox workspace is a demo workspace');
SELECT ok(
  NOT private.is_demo_workspace('30000000-0000-0000-0000-000000000001')
    AND NOT private.is_demo_workspace('a0000000-0000-0000-0000-000000000001'),
  'the template and ordinary workspaces are not demo workspaces'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_updates WHERE workspace_id = '30000000-0000-0000-0000-000000000001'),
  18,
  'cloning leaves the template untouched'
);

-- Isolation ------------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"41000000-0000-0000-0000-000000000001","email":"sandbox-1-1@demo.clientdesk.invalid","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.workspaces),
  2,
  'sandbox A owner sees only the Pro and the Free workspace of their own sandbox'
);
SELECT is(
  (SELECT count(*)::int FROM public.projects WHERE workspace_id IN ((SELECT ws_b FROM ids), (SELECT free_b FROM ids), '30000000-0000-0000-0000-000000000001')),
  0,
  'sandbox A owner sees no project of sandbox B or of the template'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_updates) + (SELECT count(*)::int FROM public.update_comments) + (SELECT count(*)::int FROM public.project_files),
  18 + 10 + 8,
  'sandbox A owner sees exactly the 18 updates, 10 comments and 8 files of their own sandbox'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_sandboxes),
  1,
  'sandbox A owner can read their own sandbox row and no other'
);
SELECT throws_ok(
  $$ select visitor_hash from public.demo_sandboxes $$,
  '42501',
  NULL,
  'the visitor hash is not readable through the API'
);

SET LOCAL request.jwt.claims TO '{"sub":"42000000-0000-0000-0000-000000000003","email":"sandbox-2-3@demo.clientdesk.invalid","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.projects),
  2,
  'a sandbox B client sees only the two projects of their own client'
);
SELECT is(
  (SELECT count(*)::int FROM public.projects WHERE workspace_id IN ((SELECT ws_a FROM ids), (SELECT free_a FROM ids), '30000000-0000-0000-0000-000000000001')),
  0,
  'a sandbox B client sees nothing of sandbox A or the template'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.demo_sandboxes),
  0,
  'a user outside every sandbox sees no sandbox row'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspaces WHERE id = '30000000-0000-0000-0000-000000000001'),
  0,
  'a user outside the template cannot see it'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ select count(*) from public.demo_sandboxes $$,
  '42501',
  NULL,
  'anon cannot read demo_sandboxes'
);
RESET ROLE;

-- Caps ------------------------------------------------------------------
-- Every check below runs as the privileged role. Fake sandboxes stand in
-- for other visitors' clones; each block removes its own before the next.
-- demo_can_start answers the same three questions without creating anything,
-- so it is checked next to the clone function at each cap.

SELECT is(public.demo_can_start('visitor-x'), 'ok', 'demo_can_start says ok for a visitor with no recent sandbox');

-- Per visitor: 3 in the last hour is the limit, older ones don't count.
SELECT pg_temp.fake_sandboxes(3, 'visitor-x', interval '10 minutes', interval '24 hours');
SELECT is(public.demo_can_start('visitor-x'), 'demo_visitor_limit', 'demo_can_start reports the per-visitor limit');
SELECT is(public.demo_can_start('someone-else'), 'ok', 'demo_can_start does not count other visitors');
SELECT throws_ok(
  $$ select public.create_demo_sandbox('43000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000004', 'visitor-x') $$,
  'CD007',
  'demo_visitor_limit',
  'a fourth sandbox in an hour for one visitor is refused with CD007'
);
SELECT pg_temp.fake_sandboxes(2, 'visitor-y', interval '10 minutes', interval '24 hours');
SELECT pg_temp.fake_sandboxes(1, 'visitor-y', interval '2 hours', interval '24 hours');
SELECT is(public.demo_can_start('visitor-y'), 'ok', 'demo_can_start ignores a sandbox older than an hour');
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ select public.create_demo_sandbox('43000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000004', 'visitor-y') $$,
  'service_role clones for a visitor with two recent sandboxes and one older than an hour'
);
SELECT is(public.demo_can_start('visitor-y'), 'demo_visitor_limit', 'demo_can_start sees the sandbox that was just created');
RESET ROLE;
SELECT pg_temp.drop_fakes();

-- Global per hour: 40 new sandboxes in the last hour is the limit. The
-- two clones above and the one just made are 3 of them.
SELECT pg_temp.fake_sandboxes(37, 'bulk', interval '10 minutes', interval '24 hours');
SELECT is(public.demo_can_start('visitor-z'), 'demo_capacity', 'demo_can_start reports the hourly capacity');
SELECT throws_ok(
  $$ select public.create_demo_sandbox('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000004', 'visitor-z') $$,
  'CD006',
  'demo_capacity',
  'the 41st sandbox in an hour is refused with CD006'
);
SELECT pg_temp.drop_fakes();

-- Global live: 300 unexpired sandboxes is the limit. Expired ones and ones
-- created more than an hour ago don't hit the hourly cap.
SELECT pg_temp.fake_sandboxes(296, 'old', interval '2 hours', interval '24 hours');
SELECT pg_temp.fake_sandboxes(5, 'stale', interval '30 hours', interval '24 hours');
SELECT is(public.demo_can_start('visitor-1'), 'ok', 'demo_can_start allows the 300th live sandbox');
SELECT lives_ok(
  $$ select public.create_demo_sandbox('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000004', 'visitor-1') $$,
  'the 300th live sandbox is allowed, expired ones not counted'
);
SELECT is(public.demo_can_start('visitor-2'), 'demo_capacity', 'demo_can_start reports the live capacity');
SELECT throws_ok(
  $$ select public.create_demo_sandbox('41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004', 'visitor-2') $$,
  'CD006',
  'demo_capacity',
  'the 301st live sandbox is refused with CD006'
);
SELECT pg_temp.drop_fakes();

-- Registry constraints --------------------------------------------------

SELECT throws_ok(
  $$ insert into public.demo_sandboxes (owner_user_id, member_user_id, client_one_user_id, client_two_user_id, visitor_hash)
     values ('41000000-0000-0000-0000-000000000001', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'dup') $$,
  '23505',
  NULL,
  'a user cannot belong to two sandboxes (owner column)'
);
SELECT throws_ok(
  $$ insert into public.demo_sandboxes (owner_user_id, member_user_id, client_one_user_id, client_two_user_id, visitor_hash)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '41000000-0000-0000-0000-000000000004', 'dup') $$,
  '23505',
  NULL,
  'a user cannot belong to two sandboxes (client two column)'
);
SELECT throws_ok(
  $$ insert into public.demo_template (workspace_id, anchor) values ('a0000000-0000-0000-0000-000000000001', now()) $$,
  '23505',
  NULL,
  'demo_template holds at most one row'
);

-- Expiry ------------------------------------------------------------------

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ select public.delete_expired_demo_sandboxes() $$,
  'service_role runs the cleanup when nothing has expired'
);
RESET ROLE;

CREATE TEMP TABLE sb AS
  SELECT
    (SELECT id FROM public.demo_sandboxes WHERE owner_user_id = '41000000-0000-0000-0000-000000000001') AS a,
    (SELECT id FROM public.demo_sandboxes WHERE owner_user_id = '42000000-0000-0000-0000-000000000001') AS b;

-- The finish checks read this table while acting as service_role.
GRANT SELECT ON sb TO service_role;

-- Sandbox B expires; sandbox A stays. One draft request is older than 7
-- days and one is fresh.
UPDATE public.demo_sandboxes SET expires_at = now() - interval '1 second' WHERE id = (SELECT b FROM sb);

CREATE TEMP TABLE b_paths AS
  SELECT array_agg(storage_path ORDER BY storage_path) AS paths
  FROM public.project_files WHERE workspace_id = (SELECT ws_b FROM ids);

INSERT INTO public.ai_draft_requests (workspace_id, user_id, project_id, created_at)
SELECT (SELECT ws_a FROM ids), '41000000-0000-0000-0000-000000000001', id, now() - interval '8 days'
FROM public.projects WHERE workspace_id = (SELECT ws_a FROM ids) LIMIT 1;
INSERT INTO public.ai_draft_requests (workspace_id, user_id, project_id, created_at)
SELECT (SELECT ws_a FROM ids), '41000000-0000-0000-0000-000000000001', id, now() - interval '1 day'
FROM public.projects WHERE workspace_id = (SELECT ws_a FROM ids) LIMIT 1;

-- The visitor started a Stripe test checkout in sandbox B's Free workspace,
-- so that workspace has a customer. The Pro workspace's pinned row has none.
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
SELECT free_b, 'cus_test_free_b', 'canceled' FROM ids;

-- A workspace outside the sandbox that only a sandbox user owns (what
-- create_workspace used to allow), with its own Stripe customer, and one it
-- shares with a real owner. Cleanup must delete the first and keep the second.
INSERT INTO public.workspaces (id, name, slug) VALUES
  ('45000000-0000-0000-0000-0000000000a1', 'Escape hatch', 'escape-hatch'),
  ('45000000-0000-0000-0000-0000000000a2', 'Shared with a real owner', 'shared-real-owner');
INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES
  ('45000000-0000-0000-0000-0000000000a1', '42000000-0000-0000-0000-000000000001', 'owner'),
  ('45000000-0000-0000-0000-0000000000a2', '42000000-0000-0000-0000-000000000001', 'owner'),
  ('45000000-0000-0000-0000-0000000000a2', '00000001-0000-0000-0000-000000000001', 'owner');
INSERT INTO public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
VALUES ('45000000-0000-0000-0000-0000000000a1', 'cus_test_escape', 'canceled');

-- Users nobody owns: created for a sandbox whose creation died half way.
-- Only the two old demo-domain users without a workspace are strays; the
-- young one, the real address, the member of a workspace and the template
-- users are not.
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ghost-old@demo.clientdesk.invalid', '{}', '{}', now() - interval '26 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'GHOST-UPPER@DEMO.CLIENTDESK.INVALID', '{}', '{}', now() - interval '26 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ghost-young@demo.clientdesk.invalid', '{}', '{}', now() - interval '1 hour', now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'person@example.com', '{}', '{}', now() - interval '26 hours', now()),
  ('00000000-0000-0000-0000-000000000000', '46000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'member-old@demo.clientdesk.invalid', '{}', '{}', now() - interval '26 hours', now());
INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES ('a0000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000005', 'member');
-- A template user that is old and has memberships stays out either way, but
-- age it too so the template check is what protects it.
UPDATE auth.users SET created_at = now() - interval '400 days' WHERE id::text LIKE '31000000-%';

CREATE TEMP TABLE old_drafts AS
  SELECT count(*)::int AS n FROM public.ai_draft_requests WHERE created_at < now() - interval '7 days';
SET LOCAL ROLE service_role;
CREATE TEMP TABLE expired AS SELECT public.delete_expired_demo_sandboxes() AS result;
RESET ROLE;

SELECT is(
  (SELECT array_agg(s ->> 'id' ORDER BY s ->> 'id') FROM expired, jsonb_array_elements(result -> 'sandboxes') s),
  ARRAY[(SELECT b::text FROM sb)],
  'expiry returns the id of the expired sandbox only'
);
SELECT is(
  (SELECT array_agg(u ORDER BY u) FROM expired, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'user_ids') u),
  ARRAY[
    '42000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002',
    '42000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000004'
  ],
  'expiry returns the four users of the expired sandbox'
);
SELECT is(
  (SELECT array_agg(p ORDER BY p) FROM expired, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'storage_paths') p),
  (SELECT paths FROM b_paths),
  'expiry returns the 8 storage paths of the expired sandbox'
);
SELECT is(
  (SELECT array_agg(c ORDER BY c) FROM expired, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'stripe_customer_ids') c),
  ARRAY['cus_test_escape', 'cus_test_free_b'],
  'expiry returns the Stripe customers of the sandbox and of its extra workspace, not the pinned row without one'
);
SELECT is(
  (SELECT array_agg(u ORDER BY u) FROM expired, jsonb_array_elements_text(result -> 'orphan_user_ids') u),
  ARRAY['46000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000002'],
  'the sweep returns old demo-domain users with no workspace, whatever the case of the address, and nobody else'
);
SELECT is((SELECT jsonb_array_length(result -> 'sandboxes') FROM expired), 1, 'expiry reports one sandbox in the batch');
SELECT is(
  (SELECT (result ->> 'draft_requests_deleted')::int FROM expired),
  (SELECT n FROM old_drafts),
  'expiry reports the AI draft requests older than 7 days it deleted'
);
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests WHERE created_at < now() - interval '7 days'),
  0,
  'no AI draft request older than 7 days remains'
);
SELECT is(
  (SELECT count(*)::int FROM public.ai_draft_requests WHERE workspace_id = (SELECT ws_a FROM ids) AND created_at = now() - interval '1 day'),
  1,
  'a recent AI draft request stays'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspaces
   WHERE id IN ((SELECT ws_b FROM ids), (SELECT free_b FROM ids), '45000000-0000-0000-0000-0000000000a1')),
  0,
  'both sandbox workspaces and the workspace only a sandbox user owned are gone'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspaces WHERE id = '45000000-0000-0000-0000-0000000000a2'),
  1,
  'a workspace with another owner stays'
);

-- The row is kept, marked, with the user ids: they are the only record of
-- what the server still has to delete.
SELECT is(
  (SELECT count(*)::int FROM public.demo_sandboxes
   WHERE id = (SELECT b FROM sb) AND deleted_at IS NOT NULL
     AND workspace_id IS NULL AND free_workspace_id IS NULL
     AND owner_user_id = '42000000-0000-0000-0000-000000000001'
     AND client_two_user_id = '42000000-0000-0000-0000-000000000004'),
  1,
  'the expired sandbox row stays, marked deleted, with no workspace and all four user ids'
);
SELECT is(
  (SELECT count(*)::int FROM auth.users WHERE id::text LIKE '42000000-%'),
  4,
  'the function leaves deleting the users to the server, which owns the admin API'
);
SELECT is(
  (SELECT count(*)::int FROM public.clients WHERE workspace_id = (SELECT ws_a FROM ids)),
  5,
  'a sandbox that has not expired keeps its data'
);
SELECT is(
  (SELECT count(*)::int FROM public.demo_sandboxes WHERE deleted_at IS NULL AND workspace_id IN (SELECT id FROM public.workspaces WHERE name = 'Northwind Studio')),
  (SELECT count(*)::int FROM public.demo_sandboxes WHERE deleted_at IS NULL),
  'every live sandbox row is a Northwind one, and no fake one is left'
);

-- Retry: the server reported a failure, so it never called finish. The next
-- run returns the same sandbox with the same users, paths and customers,
-- although its workspaces and file rows no longer exist.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE retried AS SELECT public.delete_expired_demo_sandboxes() AS result;
RESET ROLE;
SELECT is(
  (SELECT array_agg(s ->> 'id' ORDER BY s ->> 'id') FROM retried, jsonb_array_elements(result -> 'sandboxes') s),
  ARRAY[(SELECT b::text FROM sb)],
  'a sandbox that was not finished comes back on the next run'
);
SELECT is(
  (SELECT count(*)::int FROM retried, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'user_ids') u WHERE u LIKE '42000000-%'),
  4,
  'the retry still returns the four users'
);
SELECT is(
  (SELECT array_agg(p ORDER BY p) FROM retried, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'storage_paths') p),
  (SELECT paths FROM b_paths),
  'the retry still returns the storage paths, remembered from the first run'
);
SELECT is(
  (SELECT array_agg(c ORDER BY c) FROM retried, jsonb_array_elements(result -> 'sandboxes') s, jsonb_array_elements_text(s -> 'stripe_customer_ids') c),
  ARRAY['cus_test_escape', 'cus_test_free_b'],
  'the retry still returns the Stripe customers'
);

-- finish removes only rows that were marked, and reports how many.
SET LOCAL ROLE service_role;
SELECT is(
  public.finish_demo_sandbox_cleanup(ARRAY[(SELECT a FROM sb)]),
  0,
  'finish_demo_sandbox_cleanup refuses a sandbox whose workspaces were not cleaned up'
);
SELECT is(
  public.finish_demo_sandbox_cleanup(ARRAY[(SELECT b FROM sb), gen_random_uuid()]),
  1,
  'finish_demo_sandbox_cleanup removes the finished sandbox and ignores unknown ids'
);
SELECT is(
  public.finish_demo_sandbox_cleanup(ARRAY[]::uuid[]),
  0,
  'finish_demo_sandbox_cleanup with no ids does nothing'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.demo_sandboxes WHERE id IN ((SELECT a FROM sb), (SELECT b FROM sb))),
  1,
  'after finish only the live sandbox row is left'
);
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT jsonb_array_length(public.delete_expired_demo_sandboxes() -> 'sandboxes')),
  0,
  'a run after finish finds nothing to delete'
);
RESET ROLE;

-- Batches: at most 25 sandboxes per run, so one run stays short. Not yet
-- processed sandboxes come before retries, so a stuck one cannot starve
-- them. 30 expired ones: the first run takes 25, the second the other 5 and
-- 20 retries.
SELECT pg_temp.fake_sandboxes(30, 'expired-batch', interval '2 days', interval '1 day');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE batch_one AS SELECT public.delete_expired_demo_sandboxes() AS result;
CREATE TEMP TABLE batch_two AS SELECT public.delete_expired_demo_sandboxes() AS result;
RESET ROLE;
GRANT SELECT ON batch_one TO service_role;
SELECT is((SELECT jsonb_array_length(result -> 'sandboxes') FROM batch_one), 25, 'a run takes at most 25 sandboxes');
SELECT is(
  (SELECT count(DISTINCT i)::int
   FROM (SELECT jsonb_array_elements(result -> 'sandboxes') ->> 'id' AS i FROM batch_one
         UNION ALL SELECT jsonb_array_elements(result -> 'sandboxes') ->> 'id' FROM batch_two) t),
  30,
  'two runs cover all 30: sandboxes not yet processed go before retries'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspaces WHERE name = 'Fake sandbox'),
  0,
  'the workspaces of all 30 are gone after two runs'
);
SET LOCAL ROLE service_role;
SELECT is(
  public.finish_demo_sandbox_cleanup(
    (SELECT array_agg(i::uuid) FROM (SELECT jsonb_array_elements(result -> 'sandboxes') ->> 'id' AS i FROM batch_one) t)
  ),
  25,
  'finishing a batch removes its 25 rows'
);
RESET ROLE;
DELETE FROM public.demo_sandboxes WHERE deleted_at IS NOT NULL;

-- Template guards ------------------------------------------------------

-- An empty template must fail loudly instead of cloning a workspace with no
-- rows. Point the template at a workspace with nothing in it.
INSERT INTO public.workspaces (id, name, slug) VALUES ('47000000-0000-0000-0000-000000000001', 'Empty template', 'empty-template');
UPDATE public.demo_template SET workspace_id = '47000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ select public.create_demo_sandbox('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000004', 'empty') $$,
  'CD008',
  'demo_template_empty',
  'a template with no rows is refused with CD008'
);
DELETE FROM public.demo_template;
SELECT throws_ok(
  $$ select public.create_demo_sandbox('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000003', '44000000-0000-0000-0000-000000000004', 'missing') $$,
  'CD008',
  'demo_template_missing',
  'a missing template is refused with CD008'
);

SELECT * FROM finish();
ROLLBACK;
