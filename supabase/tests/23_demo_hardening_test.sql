-- Guards that keep a demo visitor inside the sandbox: they cannot own a
-- workspace outside it (create_workspace), invite anybody into it
-- (invitations trigger), or point their account at an address of their own
-- (auth.users trigger), which would let the demo relay mail.
BEGIN;
SELECT plan(27);

-- sandbox users: owner 51000000-...01, client two 51000000-...02 (mixed-case
-- address), member 51000000-...09 (never inserted into auth.users)
-- real users: owner 00000001-...01, outsider 00000009-...09 (seeded)

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'demo-owner@demo.clientdesk.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'Mixed@Demo.ClientDesk.Invalid', '{}', '{}', now(), now());

INSERT INTO public.workspaces (id, name, slug) VALUES ('a5000000-0000-0000-0000-000000000001', 'Demo guard workspace', 'demo-guard');
INSERT INTO public.workspace_members (workspace_id, user_id, role)
VALUES ('a5000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'owner');
INSERT INTO public.demo_sandboxes (workspace_id, owner_user_id, member_user_id, client_one_user_id, client_two_user_id, visitor_hash)
VALUES (
  'a5000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000009',
  gen_random_uuid(), '51000000-0000-0000-0000-000000000002', 'guard'
);

-- private.is_demo_user -------------------------------------------------

SELECT ok(private.is_demo_user('51000000-0000-0000-0000-000000000001'), 'the sandbox owner is a demo user');
SELECT ok(private.is_demo_user('51000000-0000-0000-0000-000000000009'), 'the sandbox member column counts too');
SELECT ok(private.is_demo_user('51000000-0000-0000-0000-000000000002'), 'the client two column counts too');
SELECT ok(
  NOT private.is_demo_user('00000001-0000-0000-0000-000000000001') AND NOT private.is_demo_user(NULL),
  'a real user and NULL are not demo users'
);
SELECT ok(
  (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'private.is_demo_user(uuid)'::regprocedure),
  'is_demo_user is security definer with an empty search_path'
);

-- create_workspace ----------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-0000-0000-000000000001","email":"demo-owner@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.create_workspace('Escape hatch') $$,
  'CD009',
  'demo_workspace_forbidden',
  'a demo user cannot create a workspace'
);
SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-0000-0000-000000000009","email":"x@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ select public.create_workspace('Escape hatch') $$,
  'CD009',
  'demo_workspace_forbidden',
  'a demo user listed in any of the four columns cannot create a workspace'
);
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ select public.create_workspace('Ordinary workspace') $$,
  'a real user can still create a workspace'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.workspaces WHERE name = 'Escape hatch'),
  0,
  'no workspace was created for the demo user'
);

-- invitations ---------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"51000000-0000-0000-0000-000000000001","email":"demo-owner@demo.clientdesk.invalid","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values ('a5000000-0000-0000-0000-000000000001', 'friend@example.com', 'member', null, 'demo-invite-hash', auth.uid(), now() + interval '7 days') $$,
  'CD010',
  'demo_invites_disabled',
  'the owner of a sandbox cannot insert an invitation, even straight through the API'
);
RESET ROLE;
SELECT throws_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values ('a5000000-0000-0000-0000-000000000001', 'friend@example.com', 'member', null, 'demo-invite-hash-2', '00000001-0000-0000-0000-000000000001', now() + interval '7 days') $$,
  'CD010',
  'demo_invites_disabled',
  'no role can insert an invitation into a sandbox workspace'
);
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values ('a0000000-0000-0000-0000-000000000001', 'friend@example.com', 'member', null, 'real-invite-hash', '00000001-0000-0000-0000-000000000001', now() + interval '7 days') $$,
  'an invitation into an ordinary workspace is still allowed'
);

-- auth.users: contact details of demo users are locked ------------------
-- Nothing in the app changes a demo user's address or phone, and GoTrue
-- (which updates the table as supabase_auth_admin) would otherwise send the
-- confirmation mail of `updateUser({ email })` to whatever address the
-- visitor typed. The new address lands in email_change first, so that column
-- is locked as well. The lock holds for every role.

SELECT throws_ok(
  $$ update auth.users set email = 'attacker@example.com' where id = '51000000-0000-0000-0000-000000000001' $$,
  'CD011',
  'demo_user_contact_locked',
  'a demo user email cannot change'
);
SELECT throws_ok(
  $$ update auth.users set email_change = 'attacker@example.com', email_change_sent_at = now() where id = '51000000-0000-0000-0000-000000000001' $$,
  'CD011',
  'demo_user_contact_locked',
  'a demo user cannot start an email change'
);
SELECT throws_ok(
  $$ update auth.users set phone = '+15550100' where id = '51000000-0000-0000-0000-000000000001' $$,
  'CD011',
  'demo_user_contact_locked',
  'a demo user phone cannot be set'
);
SELECT throws_ok(
  $$ update auth.users set phone_change = '+15550100' where id = '51000000-0000-0000-0000-000000000001' $$,
  'CD011',
  'demo_user_contact_locked',
  'a demo user cannot start a phone change'
);
SELECT throws_ok(
  $$ update auth.users set phone = '+15550100' where id = '51000000-0000-0000-0000-000000000002' $$,
  'CD011',
  'demo_user_contact_locked',
  'the check ignores the case of the domain'
);

-- GoTrue writes auth.users as supabase_auth_admin, a role this test cannot
-- switch to. The trigger checks no role at all, so the checks above hold for
-- it too. The real GoTrue path (`updateUser({ email })` by a signed-in demo
-- user) was tried by hand against the local stack.
SELECT lives_ok(
  $$ update auth.users set last_sign_in_at = now(), raw_user_meta_data = '{"full_name":"Maya"}', updated_at = now() where id = '51000000-0000-0000-0000-000000000001' $$,
  'a demo user can still sign in and have their metadata updated'
);
SELECT lives_ok(
  $$ update auth.users set email = email, phone = phone, email_change = email_change, phone_change = phone_change where id = '51000000-0000-0000-0000-000000000001' $$,
  'a full-row update that leaves the contact columns as they are is allowed'
);
SELECT lives_ok(
  $$ update auth.users set email_change = '' where id = '51000000-0000-0000-0000-000000000001' $$,
  'writing an empty email_change over a null one is not a change'
);
SELECT lives_ok(
  $$ update auth.users set email = 'renamed@example.com', phone = '+15550101', email_change = 'other@example.com' where id = '00000009-0000-0000-0000-000000000009' $$,
  'an ordinary user can change email, phone and email_change'
);
SELECT lives_ok(
  $$ update auth.users set email = 'demo-renamed@example.com' where id = '00000009-0000-0000-0000-000000000009' and false $$,
  'an update matching no row is fine'
);
SELECT is(
  (SELECT email FROM auth.users WHERE id = '51000000-0000-0000-0000-000000000001'),
  'demo-owner@demo.clientdesk.invalid',
  'the demo user email is unchanged after all of that'
);
SELECT lives_ok(
  $$ delete from auth.users where id = '51000000-0000-0000-0000-000000000002' $$,
  'deleting a demo user is not an update and still works'
);

-- Only the contact columns are watched: the trigger is attached to them.
SELECT is(
  (SELECT count(*)::int
   FROM pg_trigger t
   WHERE t.tgrelid = 'auth.users'::regclass
     AND NOT t.tgisinternal
     AND t.tgname = 'lock_demo_user_contact'
     AND (t.tgtype & 2) = 2 AND (t.tgtype & 16) = 16),
  1,
  'lock_demo_user_contact is one BEFORE UPDATE row trigger on auth.users'
);
SELECT is(
  (SELECT array_agg(a.attname::text ORDER BY a.attname)
   FROM pg_trigger t
   JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr)
   WHERE t.tgname = 'lock_demo_user_contact'),
  ARRAY['email', 'email_change', 'phone', 'phone_change'],
  'the trigger fires only for updates of the four contact columns'
);
SELECT ok(
  NOT has_function_privilege('anon', 'private.lock_demo_user_contact()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'private.lock_demo_user_contact()', 'EXECUTE'),
  'the trigger function is not callable through the API roles'
);

SELECT * FROM finish();
ROLLBACK;
