-- Local dev data: one workspace, two clients, and one user for every role.
-- Fixed UUIDs so pgTAP tests (supabase/tests/*.sql) can address these rows
-- directly through JWT claims instead of looking them up.
--
-- Password for every seeded user is "password123" (local/test only).

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
