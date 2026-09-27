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
-- editing this test.
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
WHERE n.nspname IN ('public', 'private')
  AND p.prosecdef;

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

-- The private.* helpers that RLS policies call run as the querying role
-- (authenticated), even though the helper itself is security definer, so
-- authenticated needs EXECUTE on every one of them or every policy that
-- calls it starts failing.
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
  has_function_privilege('authenticated', 'private.workspace_plan(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE on private.workspace_plan'
);

SELECT * FROM finish();
ROLLBACK;
