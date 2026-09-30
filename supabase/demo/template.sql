-- The "Northwind Studio" demo agency: the template every demo sandbox is
-- copied from (public.create_demo_sandbox). It gives the landing preview
-- (src/components/landing/sample-data.ts) and the social image one shared
-- story: 5 clients, 10 projects (8 active, 1 on hold, 1 done), 18 updates
-- (14 in the last week), 10 comments and 8 file rows. Nobody signs in to
-- this workspace itself; visitors get a private copy.
--
-- It runs on the local database (listed in [db.seed] sql_paths in
-- supabase/config.toml, after seed.sql) and on the hosted one (`supabase db
-- query --linked -f supabase/demo/template.sql`). Unlike seed.sql it plants
-- no known password, so it is safe to run against a hosted project.
--
-- Idempotent: the file first deletes its own rows, then inserts them, so
-- running it twice leaves exactly one copy.
--
-- The users have no password and cannot sign in. Each has an email identity
-- row anyway, the shape Supabase Auth expects for an email user. Their
-- addresses are on demo.clientdesk.invalid, a reserved domain that never
-- receives mail (the app's email layer also drops it).
--
-- Fixed UUIDs, own namespace (prefix 3), so nothing here touches the rows in
-- seed.sql. The first group tells the row type: 30 workspace, 31 users,
-- 32 clients, 33 projects, 34 updates, 35 comments, 36 files; the last group
-- is the row number.
--
-- Timestamps are fixed offsets from an anchor, never from now(): the anchor
-- is stored in public.demo_template, and the clone shifts every timestamp by
-- now() - anchor, so a fresh sandbox always shows "14 updates this week".
--
-- File rows are metadata. The blobs live in supabase/demo/files/ and are
-- uploaded to Storage by `pnpm demo:blobs`; the size_bytes here are the real
-- sizes of those files (src/lib/demo/template-files.test.ts checks it).
--
-- Users (no password):
--   maya@demo.clientdesk.invalid   Maya Chen, owner
--   leo@demo.clientdesk.invalid    Leo Park, member
--   priya@demo.clientdesk.invalid  Priya Nair, client of Acme Bakery
--   sam@demo.clientdesk.invalid    Sam Rivera, client of Lumen Dental

do $template$
declare
  v_anchor constant timestamptz := '2026-09-30 12:00:00+00';
begin
  -- Own rows first. The workspace delete cascades to its clients, projects,
  -- updates, comments, files, billing row and demo_template row; deleting a
  -- user removes the profile and identity too. Comments and files the users
  -- wrote go with the workspace, so no foreign key to auth.users is left.
  delete from public.workspaces where id = '30000000-0000-0000-0000-000000000001';
  delete from auth.users where id in (
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000003',
    '31000000-0000-0000-0000-000000000004'
  );

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
      'authenticated', 'authenticated', 'maya@demo.clientdesk.invalid',
      null,
      v_anchor - interval '125 days', null,
      '{"provider":"email","providers":["email"]}', '{"full_name":"Maya Chen"}',
      v_anchor - interval '125 days', v_anchor - interval '125 days', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '31000000-0000-0000-0000-000000000002',
      'authenticated', 'authenticated', 'leo@demo.clientdesk.invalid',
      null,
      v_anchor - interval '124 days', null,
      '{"provider":"email","providers":["email"]}', '{"full_name":"Leo Park"}',
      v_anchor - interval '124 days', v_anchor - interval '124 days', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '31000000-0000-0000-0000-000000000003',
      'authenticated', 'authenticated', 'priya@demo.clientdesk.invalid',
      null,
      v_anchor - interval '100 days', null,
      '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Nair"}',
      v_anchor - interval '100 days', v_anchor - interval '100 days', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      '31000000-0000-0000-0000-000000000004',
      'authenticated', 'authenticated', 'sam@demo.clientdesk.invalid',
      null,
      v_anchor - interval '95 days', null,
      '{"provider":"email","providers":["email"]}', '{"full_name":"Sam Rivera"}',
      v_anchor - interval '95 days', v_anchor - interval '95 days', '', '', '', ''
    );

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(),
    u.id,
    u.id::text,
    'email',
    jsonb_build_object(
      'sub', u.id::text,
      'email', u.email,
      'email_verified', true,
      'phone_verified', false
    ),
    null,
    u.created_at,
    u.created_at
  from auth.users u
  where u.id::text like '31000000-%';

  insert into public.workspaces (id, name, slug, created_by, created_at) values (
    '30000000-0000-0000-0000-000000000001',
    'Northwind Studio',
    'northwind',
    '31000000-0000-0000-0000-000000000001',
    v_anchor - interval '120 days'
  );

  insert into public.demo_template (workspace_id, anchor) values
    ('30000000-0000-0000-0000-000000000001', v_anchor);

  -- Pro billing first: on the Free plan the client-limit trigger refuses a
  -- third client, and this workspace has five. No Stripe customer: the
  -- workspace is pinned to Pro, never billed.
  insert into public.workspace_billing (workspace_id, stripe_customer_id, subscription_status, updated_at) values
    ('30000000-0000-0000-0000-000000000001', null, 'active', v_anchor - interval '120 days');

  insert into public.clients (id, workspace_id, name, created_at) values
    ('32000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Acme Bakery', v_anchor - interval '100 days'),
    ('32000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Lumen Dental', v_anchor - interval '95 days'),
    ('32000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Harbor Yoga', v_anchor - interval '90 days'),
    ('32000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Fernhill Books', v_anchor - interval '85 days'),
    ('32000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'Cedar & Stone Landscaping', v_anchor - interval '80 days');

  insert into public.workspace_members (workspace_id, user_id, role, client_id, created_at) values
    ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'owner', null, v_anchor - interval '120 days'),
    ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'member', null, v_anchor - interval '119 days'),
    ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', 'client', '32000000-0000-0000-0000-000000000001', v_anchor - interval '99 days'),
    ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000004', 'client', '32000000-0000-0000-0000-000000000002', v_anchor - interval '94 days');

  -- Projects: number, client number, name, status, age. The four newest are
  -- the ones the landing preview lists, in the same order.
  insert into public.projects (id, workspace_id, client_id, name, status, created_at)
  select
    format('33000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
    '30000000-0000-0000-0000-000000000001',
    format('32000000-0000-0000-0000-%s', lpad(v.client_n::text, 12, '0'))::uuid,
    v.name,
    v.status::public.project_status,
    v_anchor - v.age
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

  -- Updates: number, project number, author (1 Maya, 2 Leo), age, body.
  -- Numbers 1-14 fall inside the 7 days before the anchor; 15-18 are older.
  insert into public.project_updates (id, workspace_id, project_id, author_id, body, created_at)
  select
    format('34000000-0000-0000-0000-%s', lpad(v.n::text, 12, '0'))::uuid,
    '30000000-0000-0000-0000-000000000001',
    format('33000000-0000-0000-0000-%s', lpad(v.project_n::text, 12, '0'))::uuid,
    format('31000000-0000-0000-0000-%s', lpad(v.author_n::text, 12, '0'))::uuid,
    v.body,
    v_anchor - v.age
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
    v_anchor - v.age
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

  -- Files (metadata): number, project number, uploader (as above), age,
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
    v_anchor - v.age
  from (values
    (1, 3, 2, interval '25 hours', 'brand-guidelines.pdf', 1436, 'application/pdf'),
    (2, 1, 1, interval '130 minutes', 'homepage-mockup.png', 6226, 'image/png'),
    (3, 1, 3, interval '3 days', 'site-copy-feedback.docx', 1726, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    (4, 2, 1, interval '270 minutes', 'holiday-menu-proofs.pdf', 1256, 'application/pdf'),
    (5, 3, 2, interval '5 days', 'logo-directions.png', 6055, 'image/png'),
    (6, 8, 2, interval '53 hours', 'shipping-rules.docx', 1635, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    (7, 7, 1, interval '118 hours', 'campaign-results.pdf', 1185, 'application/pdf'),
    (8, 9, 1, interval '74 hours', 'gallery-layout.pdf', 1236, 'application/pdf')
  ) as v(n, project_n, uploader_n, age, name, size_bytes, mime_type);
end;
$template$;
