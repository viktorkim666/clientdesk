-- Deleting a user who created content (a workspace, an invitation, a
-- project update, a comment or a file) must not fail, and the content they
-- left behind must survive with its author column set to NULL (the app
-- then shows "Former member"). Also covers the attack case: once an author
-- column is NULL, nobody can use the "delete own" policies to claim it,
-- because `author_id = auth.uid()` (and `uploaded_by = auth.uid()`) never
-- matches NULL for anyone.
BEGIN;
SELECT plan(8);

-- Throwaway user: 00000005-0000-0000-0000-000000000005
-- Reuses workspace a0000000-0000-0000-0000-000000000001, project
-- d0000000-0000-0000-0000-00000000000a and update
-- e0000000-0000-0000-0000-00000000000a from supabase/seed.sql.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000005-0000-0000-0000-000000000005',
  'authenticated', 'authenticated', 'departing-member@clientdesk.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Devon Departing"}',
  now(), now(), '', '', '', ''
);

insert into public.workspace_members (workspace_id, user_id, role, client_id) values
  ('a0000000-0000-0000-0000-000000000001', '00000005-0000-0000-0000-000000000005', 'member', null);

insert into public.workspaces (id, name, slug, created_by) values (
  'a0000000-0000-0000-0000-000000000005',
  'Departing Member Agency',
  'departing-member-agency',
  '00000005-0000-0000-0000-000000000005'
);

insert into public.invitations (id, workspace_id, email, role, client_id, token_hash, invited_by, expires_at) values (
  '10000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001', 'invited-by-departing@clientdesk.test', 'client',
  'c0000000-0000-0000-0000-00000000000a',
  encode(extensions.digest('departing-member-invite', 'sha256'), 'hex'),
  '00000005-0000-0000-0000-000000000005', now() + interval '7 days'
);

insert into public.project_updates (id, workspace_id, project_id, author_id, body) values (
  '11000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
  '00000005-0000-0000-0000-000000000005', 'Update from a member who is about to leave.'
);

insert into public.update_comments (id, workspace_id, project_id, update_id, author_id, body) values (
  '12000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
  'e0000000-0000-0000-0000-00000000000a',
  '00000005-0000-0000-0000-000000000005', 'Comment from a member who is about to leave.'
);

insert into public.project_files (id, workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type) values (
  '13000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
  '00000005-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001/d0000000-0000-0000-0000-00000000000a/13000000-0000-0000-0000-000000000005/departing-upload.pdf',
  'departing-upload.pdf', 1024, 'application/pdf'
);

SELECT lives_ok(
  $$ delete from auth.users where id = '00000005-0000-0000-0000-000000000005' $$,
  'deleting the user who authored this content succeeds'
);

SELECT is(
  (select created_by from public.workspaces where id = 'a0000000-0000-0000-0000-000000000005'),
  null::uuid,
  'the workspace they created survives with created_by set to null'
);

SELECT is(
  (select invited_by from public.invitations where id = '10000000-0000-0000-0000-000000000005'),
  null::uuid,
  'the invitation they sent survives with invited_by set to null'
);

SELECT is(
  (select author_id from public.project_updates where id = '11000000-0000-0000-0000-000000000005'),
  null::uuid,
  'the update they posted survives with author_id set to null'
);

SELECT is(
  (select author_id from public.update_comments where id = '12000000-0000-0000-0000-000000000005'),
  null::uuid,
  'the comment they posted survives with author_id set to null'
);

SELECT is(
  (select uploaded_by from public.project_files where id = '13000000-0000-0000-0000-000000000005'),
  null::uuid,
  'the file they uploaded survives with uploaded_by set to null'
);

-- Attack: a client who can read this project cannot delete the departed
-- member's now-authorless comment or file through the "own" branch of
-- either delete policy.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';

DELETE FROM public.update_comments WHERE id = '12000000-0000-0000-0000-000000000005';
SELECT isnt_empty(
  $$ select 1 from public.update_comments where id = '12000000-0000-0000-0000-000000000005' $$,
  'client A cannot delete the departed member''s comment via the "own" policy'
);

DELETE FROM public.project_files WHERE id = '13000000-0000-0000-0000-000000000005';
SELECT isnt_empty(
  $$ select 1 from public.project_files where id = '13000000-0000-0000-0000-000000000005' $$,
  'client A cannot delete the departed member''s file via the "own" policy'
);

SELECT * FROM finish();
ROLLBACK;
