-- Local dev data: one workspace, two clients, and one user for every role.
-- Fixed UUIDs so pgTAP tests (supabase/tests/*.sql) can address these rows
-- directly through JWT claims instead of looking them up.
--
-- Password for every seeded user is "password123" (local/test only).
--
-- This file is for local development and CI only - it plants known
-- passwords and fixed UUIDs on purpose, which is exactly what a real
-- project must never have. Never run it against a hosted Supabase project.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'owner@clientdesk.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Olivia Owner"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000002-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'member@clientdesk.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Mason Member"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '0000000a-0000-0000-0000-00000000000a',
    'authenticated', 'authenticated', 'client-a@clientdesk.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Carla Client A"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '0000000b-0000-0000-0000-00000000000b',
    'authenticated', 'authenticated', 'client-b@clientdesk.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Blake Client B"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000009-0000-0000-0000-000000000009',
    'authenticated', 'authenticated', 'outsider@clientdesk.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Nora Non-member"}',
    now(), now(), '', '', '', ''
  );

insert into public.workspaces (id, name, slug, created_by) values (
  'a0000000-0000-0000-0000-000000000001',
  'Acme Agency',
  'acme-agency',
  '00000001-0000-0000-0000-000000000001'
);

insert into public.clients (id, workspace_id, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'Client A Inc.'),
  ('c0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'Client B LLC');

insert into public.workspace_members (workspace_id, user_id, role, client_id) values
  ('a0000000-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', 'owner', null),
  ('a0000000-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000002', 'member', null),
  ('a0000000-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000000a', 'client', 'c0000000-0000-0000-0000-00000000000a'),
  ('a0000000-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-00000000000b', 'client', 'c0000000-0000-0000-0000-00000000000b');

insert into public.projects (id, workspace_id, client_id, name, status) values
  ('d0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Client A Website Redesign', 'active'),
  ('d0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'Client B Brand Refresh', 'on_hold');

-- Fixed project ids above let pgTAP tests (07-11) address updates, comments
-- and files by project_id directly, the same way the other fixtures do.

insert into public.project_updates (id, workspace_id, project_id, author_id, body) values
  ('e0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', '00000001-0000-0000-0000-000000000001', 'Kickoff call notes and next steps.'),
  ('e0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b', '00000001-0000-0000-0000-000000000001', 'Brand refresh is paused pending budget approval.');

insert into public.update_comments (id, workspace_id, project_id, update_id, author_id, body) values
  ('f0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', '0000000a-0000-0000-0000-00000000000a', 'Thanks for the update, looking forward to the draft.'),
  ('f0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', '00000001-0000-0000-0000-000000000001', 'Draft is on track for Friday.');

insert into public.project_files (id, workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type) values
  ('90000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', '00000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000a/kickoff-notes.pdf', 'kickoff-notes.pdf', 204800, 'application/pdf'),
  ('90000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b', '00000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000b/90000000-0000-0000-0000-00000000000b/brand-refresh-brief.pdf', 'brand-refresh-brief.pdf', 512000, 'application/pdf'),
  ('90000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', '0000000a-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/90000000-0000-0000-0000-00000000000c/site-copy-feedback.docx', 'site-copy-feedback.docx', 40960, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

-- A second, separate workspace, already on the Pro plan, for
-- e2e/ai-draft.spec.ts. It needs a real Pro workspace to exercise the
-- "Draft update" button, but e2e has no Stripe keys and no service-role
-- key to fake a subscription at runtime (see that spec for the full
-- reasoning), so this row is written here instead, directly by the
-- migration/seed role that bypasses RLS - the same way 13_plan_limits_test
-- and 14_ai_draft_requests_test flip a workspace to Pro for their own
-- fixtures. Fixed UUIDs, own namespace (prefix 2), so this never touches
-- the workspace `a0000000-...-000000000001` that 13_plan_limits_test and
-- 14_ai_draft_requests_test assert starts Free. The spec creates its own
-- clients, projects and staff/client users under this workspace per run
-- (fresh UUIDs each time, via the UI), so only the owner and the Pro
-- billing row need to be fixed here.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000002-0000-0000-0000-000000000021',
  'authenticated', 'authenticated', 'ai-draft-owner@clientdesk.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Pro Owner"}',
  now(), now(), '', '', '', ''
);

insert into public.workspaces (id, name, slug, created_by) values (
  '20000000-0000-0000-0000-000000000001',
  'AI Draft Pro Agency',
  'ai-draft-pro-agency',
  '00000002-0000-0000-0000-000000000021'
);

insert into public.workspace_members (workspace_id, user_id, role, client_id) values
  ('20000000-0000-0000-0000-000000000001', '00000002-0000-0000-0000-000000000021', 'owner', null);

insert into public.workspace_billing (workspace_id, stripe_customer_id, subscription_status) values
  ('20000000-0000-0000-0000-000000000001', 'cus_seed_ai_draft_pro_agency', 'active');

-- A third, separate workspace: the "Northwind Studio" demo agency. It gives
-- the landing preview (src/components/landing/sample-data.ts), the social
-- image and a real signed-in session one shared story: 5 clients, 10
-- projects (8 active, 1 on hold, 1 done), about 14 updates in the last week,
-- comments and file rows. It exists for demos and visual review only. No
-- pgTAP test depends on it, and pgTAP counts run under each test user's JWT,
-- so a workspace they don't belong to stays invisible to them. Two e2e specs
-- read it: e2e/demo-data.spec.ts (the counts below) and
-- e2e/visual-polish.spec.ts (names, file rows and metric cards).
--
-- Fixed UUIDs, own namespace (prefix 3), so nothing here touches the rows
-- above. The first group tells the row type: 30 workspace, 31 users,
-- 32 clients, 33 projects, 34 updates, 35 comments, 36 files; the last group
-- is the row number.
--
-- Timestamps are relative to now(), so the "Updates this week" count is fresh
-- right after each `supabase db reset` and decays as the database ages. File
-- rows are metadata only: Storage blobs can't be written from SQL, so a
-- download from a demo file returns an error until the demo reset job uploads
-- real ones.
--
-- Accounts (password "password123", like the rest of this file):
--   maya@northwind.test      owner
--   leo@northwind.test       member
--   priya@acmebakery.test    client of Acme Bakery
--   sam@lumendental.test     client of Lumen Dental

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'maya@northwind.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Maya Chen"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'leo@northwind.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Leo Park"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'priya@acmebakery.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Nair"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'sam@lumendental.test',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Sam Rivera"}',
    now(), now(), '', '', '', ''
  );

insert into public.workspaces (id, name, slug, created_by, created_at) values (
  '30000000-0000-0000-0000-000000000001',
  'Northwind Studio',
  'northwind',
  '31000000-0000-0000-0000-000000000001',
  now() - interval '120 days'
);

-- Pro billing first: on the Free plan the client-limit trigger refuses a
-- third client, and this workspace has five.
insert into public.workspace_billing (workspace_id, stripe_customer_id, subscription_status) values
  ('30000000-0000-0000-0000-000000000001', 'cus_seed_northwind_studio', 'active');

insert into public.clients (id, workspace_id, name, created_at) values
  ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Acme Bakery', now() - interval '100 days'),
  ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Lumen Dental', now() - interval '95 days'),
  ('32000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Harbor Yoga', now() - interval '90 days'),
  ('32000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Fernhill Books', now() - interval '85 days'),
  ('32000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'Cedar & Stone Landscaping', now() - interval '80 days');

insert into public.workspace_members (workspace_id, user_id, role, client_id) values
  ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'owner', null),
  ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'member', null),
  ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', 'client', '32000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004', 'client', '32000000-0000-0000-0000-000000000002');

-- Projects: number, client number, name, status, age. The four newest are the
-- ones the landing preview lists, in the same order.
insert into public.projects (id, workspace_id, client_id, name, status, created_at)
select
  format('33000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001',
  format('32000000-0000-0000-0000-%s', lpad(v.client_n::text, 12, '0'))::uuid,
  v.name,
  v.status::public.project_status,
  now() - v.age
from (values
  (1, 1, 'Website redesign', 'active', interval '20 days'),
  (2, 1, 'Holiday menu and packaging', 'active', interval '30 days'),
  (3, 2, 'Brand refresh', 'active', interval '22 days'),
  (4, 2, 'Appointment reminder emails', 'active', interval '35 days'),
  (5, 3, 'Booking flow', 'on_hold', interval '25 days'),
  (6, 3, 'Membership landing page', 'active', interval '42 days'),
  (7, 4, 'Launch campaign', 'done', interval '28 days'),
  (8, 4, 'Online store setup', 'active', interval '50 days'),
  (9, 5, 'Portfolio site', 'active', interval '60 days'),
  (10, 5, 'Spring newsletter', 'active', interval '70 days')
) as v(n, client_n, name, status, age);

-- Updates: number, project number, author (1 Maya, 2 Leo), age, body. Numbers
-- 1-14 fall inside the last 7 days; 15-18 are older.
insert into public.project_updates (id, workspace_id, project_id, author_id, body, created_at)
select
  format('34000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001',
  format('33000000-0000-0000-0000-%s', lpad(v.project_n::text, 12, '0'))::uuid,
  format('31000000-0000-0000-0000-%s', lpad(v.author_n::text, 12, '0'))::uuid,
  v.body,
  now() - v.age
from (values
  (1, 1, 1, interval '2 hours',
    'Homepage layout is ready for review. The menu page is next.'),
  (2, 3, 2, interval '26 hours',
    'Logo exploration is done. We narrowed it to two directions, a rounded wordmark and a monogram. Sam, please pick one by Thursday so we can build the full guidelines.'),
  (3, 2, 1, interval '5 hours',
    'Print proofs for the holiday menu came back from the printer. Colors match the screen mockups, but the pastry photos look slightly dark. We are re-exporting them with a brighter profile.'),
  (4, 4, 2, interval '9 hours',
    'The first reminder email is drafted. It confirms the appointment, lists what to bring and links to the reschedule page. Please read the tone and tell us if it sounds like your front desk.'),
  (5, 6, 1, interval '2 days',
    'The membership page now shows the three class packs and a comparison table. Copy for the FAQ is in progress. We will share a preview link on Monday.'),
  (6, 8, 2, interval '54 hours',
    'Product import is finished: 42 items with photos and prices. Shipping rules are set for local delivery and standard post. Next up is the checkout test with a real card.'),
  (7, 9, 1, interval '3 days',
    'The gallery layout for the portfolio site is approved. We are adding before-and-after sliders for the three biggest garden projects.'),
  (8, 10, 2, interval '77 hours',
    'The spring newsletter template is built and tested in Gmail and Outlook. The hero image is a placeholder until your new photos arrive. Send them by Friday and we can schedule it for next week.'),
  (9, 1, 2, interval '4 days',
    'Navigation is simplified to five items: Menu, Order, Catering, Story and Contact. Mobile spacing is fixed on the menu page. Please check it on your phone and tell us if anything looks off.'),
  (10, 5, 1, interval '100 hours',
    'We paused the booking flow while Harbor Yoga confirms the payment provider. Wireframes for the class picker and the checkout are ready and will not change. We will restart within a day of the decision.'),
  (11, 7, 2, interval '5 days',
    'The launch campaign wrapped up. The newsletter reached 3,200 readers and the pre-order page got 410 visits in the first weekend. A short results summary is attached in the files.'),
  (12, 3, 1, interval '128 hours',
    'The color palette is locked: deep teal with a warm sand accent. Both pass contrast checks on the clinic''s printed forms. Typography choices come next.'),
  (13, 2, 2, interval '6 days',
    'Kickoff for the holiday packaging is done. We will design the box sleeve, the sticker and the paper bag. First sketches arrive next Tuesday.'),
  (14, 9, 2, interval '150 hours',
    'The site map for the portfolio is agreed: Home, Projects, Services, About and Contact. We are collecting photos from your last five jobs. Please upload the originals when you can.'),
  (15, 1, 1, interval '12 days',
    'Kickoff for the Acme Bakery website is complete. We agreed on the goals: online ordering for cakes, a clear menu and a catering form. The homepage layout starts this week.'),
  (16, 3, 2, interval '15 days',
    'The brand audit is finished. We reviewed the current logo, signage and printed materials, and found four inconsistent color values.'),
  (17, 7, 1, interval '18 days',
    'The campaign schedule is confirmed: teaser posts start Monday, the newsletter goes out Thursday and launch day is the following Tuesday. Copy drafts are ready for your review.'),
  (18, 8, 1, interval '24 days',
    'The store platform is chosen and the domain is connected. We start importing products next week.')
) as v(n, project_n, author_n, age, body);

-- Comments: number, update number, author (1 Maya, 2 Leo, 3 Priya, 4 Sam),
-- age, body. Each is younger than the update it answers.
insert into public.update_comments (id, workspace_id, project_id, update_id, author_id, body, created_at)
select
  format('35000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001',
  u.project_id,
  u.id,
  format('31000000-0000-0000-0000-%s', lpad(v.author_n::text, 12, '0'))::uuid,
  v.body,
  now() - v.age
from (values
  (1, 1, 3, interval '1 hour',
    'Looks great. Can we try a warmer photo in the header?'),
  (2, 1, 1, interval '40 minutes',
    'Sure, swapping it in now.'),
  (3, 2, 4, interval '20 hours',
    'Love the monogram direction. Could we see it on a white and on a dark background before we decide?'),
  (4, 2, 2, interval '18 hours',
    'Yes, I will add both versions to the next share.'),
  (5, 3, 3, interval '3 hours',
    'Thanks for catching the dark photos. Please send the new export once it is ready.'),
  (6, 9, 3, interval '3 days',
    'Checked on my phone. The menu looks good, but the Order button sits too close to the edge on my older phone.'),
  (7, 4, 4, interval '6 hours',
    'The tone is friendly and clear. Can the reminder go out two days before the visit instead of one?'),
  (8, 6, 1, interval '2 days',
    'Great. I will run the checkout test tomorrow morning.'),
  (9, 11, 1, interval '116 hours',
    'Thanks, Leo. I will send the summary with the final invoice.'),
  (10, 12, 4, interval '5 days',
    'Teal and sand feels right for us. Approved.')
) as v(n, update_n, author_n, age, body)
join public.project_updates u
  on u.id = format('34000000-0000-0000-0000-%s', lpad(v.update_n::text, 12, '0'))::uuid;

-- Files (metadata only): number, project number, uploader (as above), age,
-- name, size in bytes, mime type. storage_path is
-- <workspace id>/<project id>/<file id>/<name>, the format the app uploads.
insert into public.project_files (id, workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type, created_at)
select
  format('36000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
  '30000000-0000-0000-0000-000000000001',
  format('33000000-0000-0000-0000-%s', lpad(v.project_n::text, 12, '0'))::uuid,
  format('31000000-0000-0000-0000-%s', lpad(v.uploader_n::text, 12, '0'))::uuid,
  format(
    '30000000-0000-0000-0000-000000000001/33000000-0000-0000-0000-%s/36000000-0000-0000-0000-%s/%s',
    lpad(v.project_n::text, 12, '0'), lpad(v.n::text, 12, '0'), v.name
  ),
  v.name,
  v.size_bytes,
  v.mime_type,
  now() - v.age
from (values
  (1, 3, 2, interval '25 hours', 'brand-guidelines.pdf', 2516582, 'application/pdf'),
  (2, 1, 1, interval '130 minutes', 'homepage-mockup.png', 1153434, 'image/png'),
  (3, 1, 3, interval '3 days', 'site-copy-feedback.docx', 38912, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  (4, 2, 1, interval '270 minutes', 'holiday-menu-proofs.pdf', 5033164, 'application/pdf'),
  (5, 3, 2, interval '5 days', 'logo-directions.png', 8912896, 'image/png'),
  (6, 8, 2, interval '53 hours', 'shipping-rules.docx', 45056, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  (7, 7, 1, interval '118 hours', 'campaign-results.pdf', 812000, 'application/pdf'),
  (8, 9, 1, interval '74 hours', 'gallery-layout.pdf', 9437184, 'application/pdf')
) as v(n, project_n, uploader_n, age, name, size_bytes, mime_type);
