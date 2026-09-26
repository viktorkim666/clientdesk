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

insert into public.projects (workspace_id, client_id, name, status) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'Client A Website Redesign', 'active'),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'Client B Brand Refresh', 'on_hold');
