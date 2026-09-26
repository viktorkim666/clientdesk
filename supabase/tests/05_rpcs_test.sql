-- create_workspace() and accept_invitation(), including the attack cases:
-- accepting an invitation with the wrong email, reusing an already-accepted
-- token, and accepting an expired token.
BEGIN;
SELECT plan(10);

-- workspace: a0000000-0000-0000-0000-000000000001
-- client A:  c0000000-0000-0000-0000-00000000000a
-- owner:     00000001-0000-0000-0000-000000000001
-- outsider:  00000009-0000-0000-0000-000000000009 (email outsider@clientdesk.test)

-- create_workspace(): a signed-in user becomes the owner of a brand new
-- workspace in one call.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ select public.create_workspace('Brand New Agency') $$,
  'create_workspace succeeds for a signed-in user'
);
SELECT is(
  (SELECT count(*)::int FROM public.workspace_members
     WHERE user_id = '00000001-0000-0000-0000-000000000001' AND role = 'owner'),
  2,
  'create_workspace makes the caller the owner of the new workspace'
);

-- create_workspace() refuses to run without a signed-in user.
SET LOCAL ROLE anon;
RESET request.jwt.claims;
SELECT throws_ok(
  $$ select public.create_workspace('Anonymous Agency') $$,
  'authentication required',
  'create_workspace is rejected for an anonymous caller'
);

-- accept_invitation(): the happy path, then every attack case.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'outsider@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('valid-token', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'fixture: the owner creates a valid invitation for the outsider'
);
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'someone-else@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('wrong-email-token', 'sha256'), 'hex'),
         auth.uid(), now() + interval '7 days'
       ) $$,
  'fixture: the owner creates an invitation addressed to someone else'
);
SELECT lives_ok(
  $$ insert into public.invitations (workspace_id, email, role, client_id, token_hash, invited_by, expires_at)
       values (
         'a0000000-0000-0000-0000-000000000001', 'outsider@clientdesk.test', 'client',
         'c0000000-0000-0000-0000-00000000000a',
         encode(extensions.digest('expired-token', 'sha256'), 'hex'),
         auth.uid(), now() - interval '1 day'
       ) $$,
  'fixture: the owner creates an already-expired invitation'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';

-- Attack: accepting an invitation addressed to a different email.
SELECT throws_ok(
  $$ select public.accept_invitation('wrong-email-token') $$,
  'invitation email does not match the signed-in user',
  'accept_invitation rejects an invitation addressed to a different email'
);

-- Attack: accepting an expired token.
SELECT throws_ok(
  $$ select public.accept_invitation('expired-token') $$,
  'invitation has expired',
  'accept_invitation rejects an expired token'
);

-- Happy path: accepting a valid invitation whose email matches the caller.
SELECT lives_ok(
  $$ select public.accept_invitation('valid-token') $$,
  'accept_invitation succeeds for a matching, unexpired token'
);

-- Attack: reusing the token after it has already been accepted.
SELECT throws_ok(
  $$ select public.accept_invitation('valid-token') $$,
  'invitation was already accepted',
  'accept_invitation rejects a token that was already used'
);

SELECT * FROM finish();
ROLLBACK;
