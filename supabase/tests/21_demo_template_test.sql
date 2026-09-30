-- The Northwind Studio template (supabase/demo/template.sql): the source
-- public.create_demo_sandbox copies for every visitor. Checks its shape
-- (counts), that nobody can sign in as a template user (no password, an
-- email identity each, addresses on the reserved .invalid domain), and that
-- every timestamp is a fixed offset from the recorded anchor.
--
-- Reads the rows `supabase db reset` seeds (or `supabase db query --local -f
-- supabase/demo/template.sql` applies). Idempotency is checked by hand:
-- run the file twice and the counts below still hold.
BEGIN;
SELECT plan(18);

-- template workspace: 30000000-0000-0000-0000-000000000001
-- users: 31000000-...-000000000001 to 04 (Maya, Leo, Priya, Sam)

SELECT is(
  (SELECT count(*)::int FROM public.workspaces WHERE id = '30000000-0000-0000-0000-000000000001' AND slug = 'northwind' AND name = 'Northwind Studio'),
  1,
  'the template workspace exists with its fixed id, slug and name'
);
SELECT is((SELECT count(*)::int FROM public.clients WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 5, 'the template has 5 clients');
SELECT is((SELECT count(*)::int FROM public.projects WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 10, 'the template has 10 projects');
SELECT is((SELECT count(*)::int FROM public.project_updates WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 18, 'the template has 18 updates');
SELECT is((SELECT count(*)::int FROM public.update_comments WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 10, 'the template has 10 comments');
SELECT is((SELECT count(*)::int FROM public.project_files WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 8, 'the template has 8 file rows');
SELECT is((SELECT count(*)::int FROM public.workspace_members WHERE workspace_id = '30000000-0000-0000-0000-000000000001'), 4, 'the template has 4 members');

SELECT is(
  (SELECT count(*)::int FROM public.workspace_billing
   WHERE workspace_id = '30000000-0000-0000-0000-000000000001'
     AND subscription_status = 'active' AND stripe_customer_id IS NULL),
  1,
  'the template is pinned to Pro with no Stripe customer'
);

-- Sign-in --------------------------------------------------------------

SELECT is(
  (SELECT count(*)::int FROM auth.users
   WHERE id IN (SELECT user_id FROM public.workspace_members WHERE workspace_id = '30000000-0000-0000-0000-000000000001')),
  4,
  'the four template members are auth users'
);
SELECT is(
  (SELECT count(*)::int FROM auth.users
   WHERE id::text LIKE '31000000-%' AND coalesce(encrypted_password, '') <> ''),
  0,
  'no template user has a password, so none can sign in'
);
SELECT is(
  (SELECT count(*)::int FROM auth.users
   WHERE id::text LIKE '31000000-%' AND email LIKE '%@demo.clientdesk.invalid'),
  4,
  'every template user has an address on the reserved demo.clientdesk.invalid domain'
);
SELECT is(
  (SELECT count(*)::int FROM auth.identities i
   JOIN auth.users u ON u.id = i.user_id
   WHERE u.id::text LIKE '31000000-%'
     AND i.provider = 'email'
     AND i.provider_id = u.id::text
     AND i.identity_data ->> 'sub' = u.id::text
     AND i.identity_data ->> 'email' = u.email
     AND (i.identity_data ->> 'email_verified')::boolean),
  4,
  'each template user has a matching verified email identity'
);
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '31000000-0000-0000-0000-000000000001'),
  'Maya Chen',
  'template users keep their names'
);

-- Timestamps -----------------------------------------------------------

SELECT is(
  (SELECT anchor FROM public.demo_template WHERE workspace_id = '30000000-0000-0000-0000-000000000001'),
  '2026-09-30 12:00:00+00'::timestamptz,
  'the template records its anchor'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_updates
   WHERE workspace_id = '30000000-0000-0000-0000-000000000001'
     AND created_at > '2026-09-30 12:00:00+00'::timestamptz - interval '7 days'),
  14,
  '14 template updates fall within 7 days of the anchor'
);
SELECT is(
  (SELECT max(created_at) FROM public.project_updates WHERE workspace_id = '30000000-0000-0000-0000-000000000001'),
  '2026-09-30 12:00:00+00'::timestamptz - interval '2 hours',
  'the newest template update is 2 hours before the anchor'
);
-- Exact offsets, not just "nothing is in the future": moving any template
-- timestamp changes what every sandbox shows, so each table's oldest and
-- newest offset from the anchor is pinned here.
SELECT is(
  (SELECT count(*)::int
   FROM (
     SELECT 'workspaces' AS t, min(created_at - d.anchor) AS lo, max(created_at - d.anchor) AS hi
       FROM public.workspaces w, public.demo_template d WHERE w.id = d.workspace_id
     UNION ALL SELECT 'clients', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.clients x, public.demo_template d WHERE x.workspace_id = d.workspace_id
     UNION ALL SELECT 'projects', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.projects x, public.demo_template d WHERE x.workspace_id = d.workspace_id
     UNION ALL SELECT 'updates', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.project_updates x, public.demo_template d WHERE x.workspace_id = d.workspace_id
     UNION ALL SELECT 'comments', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.update_comments x, public.demo_template d WHERE x.workspace_id = d.workspace_id
     UNION ALL SELECT 'files', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.project_files x, public.demo_template d WHERE x.workspace_id = d.workspace_id
     UNION ALL SELECT 'members', min(x.created_at - d.anchor), max(x.created_at - d.anchor)
       FROM public.workspace_members x, public.demo_template d WHERE x.workspace_id = d.workspace_id
   ) o
   JOIN (VALUES
     ('workspaces', interval '-120 days', interval '-120 days'),
     ('clients', interval '-100 days', interval '-80 days'),
     ('projects', interval '-70 days', interval '-20 days'),
     ('updates', interval '-24 days', interval '-2 hours'),
     ('comments', interval '-5 days', interval '-40 minutes'),
     ('files', interval '-5 days', interval '-2 hours -10 minutes'),
     ('members', interval '-120 days', interval '-94 days')
   ) e (t, lo, hi) ON e.t = o.t AND e.lo = o.lo AND e.hi = o.hi),
  7,
  'every template table sits at its exact offsets from the anchor, none at now()'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_files
   WHERE workspace_id = '30000000-0000-0000-0000-000000000001'
     AND storage_path <> workspace_id || '/' || project_id || '/' || id || '/' || name),
  0,
  'every template file path follows workspace/project/file/name'
);

SELECT * FROM finish();
ROLLBACK;
