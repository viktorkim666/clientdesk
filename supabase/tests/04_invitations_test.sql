-- Access matrix for public.invitations, including the attack case: a member
-- inviting another member (only an owner may invite staff; a member may only
-- invite clients).
BEGIN;
SELECT plan(12);

-- workspace: a0000000-0000-0000-0000-000000000001
-- client A:  c0000000-0000-0000-0000-00000000000a
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;

-- The owner can invite a client.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'new-client@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('owner-invites-client', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'the owner can invite a client'
);

-- The owner can also invite a new member.
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'new-member@clientdesk.test', 'member', null,
         encode(extensions.digest('owner-invites-member', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'the owner can invite a member'
);

-- Attack: a member cannot invite another member.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'sneaky-member@clientdesk.test', 'member', null,
         encode(extensions.digest('member-invites-member', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'new row violates row-level security policy for table "invitations"',
  'a member cannot invite another member'
);

-- A member can invite a client.
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'member-invited-client@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('member-invites-client', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'a member can invite a client'
);

-- A client cannot invite anyone.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'client-invited@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('client-invites-client', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'new row violates row-level security policy for table "invitations"',
  'a client cannot invite anyone'
);

-- Neither can a non-member.
SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'outsider-invited@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('outsider-invites-client', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'new row violates row-level security policy for table "invitations"',
  'a non-member cannot invite anyone'
);

-- Owner and member can list every pending invitation; a client and a
-- non-member see none.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  3,
  'the owner sees every pending invitation'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  3,
  'a member sees every pending invitation'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.invitations $$,
  'a client sees no invitations'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.invitations $$,
  'a non-member sees no invitations'
);

-- Only the owner can revoke (delete) an invitation.
SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
DELETE FROM public.invitations WHERE email = 'new-client@clientdesk.test';
SELECT is(
  (SELECT count(*)::int FROM public.invitations WHERE email = 'new-client@clientdesk.test'),
  1,
  'a member cannot revoke an invitation'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ delete from public.invitations where email = 'new-client@clientdesk.test' $$,
  'the owner can revoke an invitation'
);

SELECT * FROM finish();
ROLLBACK;
