-- Defense in depth: Supabase's project template grants EXECUTE on every
-- new function in schema public to anon (and authenticated, service_role)
-- through its own default privileges, so `revoke execute on function ...
-- from public` (used by earlier migrations) never actually removed anon's
-- access -- `public` is a different grantee than the by-name `anon` grant
-- Supabase's defaults add. No RLS policy in this schema is `to anon` and
-- every SECURITY DEFINER RPC already rejects an anonymous caller itself
-- (`auth.uid() is null`), so none of this was an exploitable bypass, but
-- the privilege should still match the intent.
--
-- The anon check below is generated from pg_proc/pg_namespace, not
-- hardcoded, so a future SECURITY DEFINER function is covered without
-- editing this test. Schema private is checked in full, not just its
-- SECURITY DEFINER functions: a plain (invoker-rights) helper such as
-- private.slugify or private.storage_path_uuid never got Supabase's public
-- schema default privileges, so it keeps Postgres's built-in "every
-- function is EXECUTE-able by PUBLIC" grant until revoked by name, same as
-- a SECURITY DEFINER one would.
BEGIN;
SELECT no_plan();

SELECT ok(
  NOT has_function_privilege('anon', p.oid, 'EXECUTE'),
  format(
    'anon has no EXECUTE on %I.%I(%s)',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  )
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'public' AND p.prosecdef)
   OR n.nspname = 'private';

-- The RPCs the app calls directly must stay callable by a signed-in user.
SELECT ok(
  has_function_privilege('authenticated', 'public.create_workspace(text)', 'EXECUTE'),
  'authenticated has EXECUTE on public.create_workspace'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'),
  'authenticated has EXECUTE on public.accept_invitation'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.project_update_recipients(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on public.project_update_recipients'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.claim_ai_draft(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on public.claim_ai_draft'
);

-- The allow-list below is exactly the set of private.* functions an RLS or
-- storage policy calls directly. Such a helper runs as the querying role
-- (authenticated), even though the helper itself is security definer, so
-- authenticated needs EXECUTE on every one of them or every policy that
-- calls it starts failing. A private function called only from inside
-- another SECURITY DEFINER function or a trigger does not belong here --
-- see the comment below.
SELECT ok(
  has_function_privilege('authenticated', 'private.member_role(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.member_role'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.member_client_id(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.member_client_id'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.is_staff(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.is_staff'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.can_read_project(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.can_read_project'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.can_access_storage_object(text)', 'EXECUTE'),
  'authenticated has EXECUTE on private.can_access_storage_object'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.can_view_profile(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.can_view_profile'
);
SELECT ok(
  has_function_privilege('authenticated', 'private.storage_path_uuid(text, integer)', 'EXECUTE'),
  'authenticated has EXECUTE on private.storage_path_uuid'
);

-- Every other function in schema private -- one no RLS/storage policy
-- calls directly, only from inside a SECURITY DEFINER function or a
-- trigger -- must stay unreachable by authenticated too: it inherits its
-- access from the definer, never from the querying role. Generated from
-- pg_proc against the allow-list above, not hardcoded, so a new helper
-- added to private is covered without editing this test.
SELECT ok(
  NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
  format(
    'authenticated has no EXECUTE on %I.%I(%s)',
    n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  )
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.oid::regprocedure::text NOT IN (
    'private.member_role(uuid)',
    'private.member_client_id(uuid)',
    'private.is_staff(uuid)',
    'private.can_read_project(uuid)',
    'private.can_access_storage_object(text)',
    'private.can_view_profile(uuid)',
    'private.storage_path_uuid(text,integer)'
  );

SELECT * FROM finish();
ROLLBACK;
