-- Defense in depth: closes an EXECUTE grant that `anon` was never meant to
-- have on this schema's SECURITY DEFINER functions.
--
-- Supabase's project template runs `alter default privileges ... in schema
-- public grant execute on functions to anon, authenticated, service_role`,
-- so every function created in schema public by the migration role
-- (postgres) picks up an explicit `anon=X/postgres` grant at creation time.
-- `revoke execute on function ... from public`, used by earlier migrations
-- for the app's RPCs, only removes the separate implicit grant to the
-- `public` pseudo-role; it does nothing to that by-name `anon` grant. That
-- is why `\df+` still shows `anon=X/postgres` on every one of them. The
-- `private` schema has no such default privileges of its own, so its
-- functions instead keep Postgres's built-in "every function is
-- EXECUTE-able by PUBLIC unless revoked" default, which every role
-- (including anon) inherits through the `public` pseudo-role.
--
-- Neither gap was reachable in practice: no RLS policy in this schema is
-- `to anon`, and every RPC already checks `auth.uid() is null` itself. This
-- migration just makes the grants match that intent, so a future policy or
-- RPC that forgets its own auth check doesn't inherit anon access by
-- accident.

-- Public RPCs: strip the by-name anon grant the earlier `revoke ... from
-- public` couldn't reach. authenticated keeps EXECUTE from each RPC's
-- existing grant.
revoke execute on function public.create_workspace(text) from anon;
revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.project_update_recipients(uuid) from anon;
revoke execute on function public.claim_ai_draft(uuid) from anon;

-- handle_new_user is fired only by the on_auth_user_created trigger (as
-- supabase_auth_admin); no role calls it directly. Unlike the four RPCs
-- above, no earlier migration ever revoked its build-in "PUBLIC can
-- execute" grant (the one every function gets at creation regardless of
-- Supabase's default privileges, which only add to it, not replace it),
-- so both that and the by-name anon grant need revoking here.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

-- private.* helpers: revoke the implicit PUBLIC grant outright, then
-- restore it for authenticated by name where a `to authenticated` RLS
-- policy calls the helper (a policy's function calls need EXECUTE for the
-- querying role, even though the function itself runs as its definer).
-- The remaining three are trigger-only, the same shape as
-- protect_last_owner in the init migration: no role calls them directly,
-- so neither needs a grant back.
revoke execute on function private.member_role(uuid) from public;
grant execute on function private.member_role(uuid) to authenticated;

revoke execute on function private.member_client_id(uuid) from public;
grant execute on function private.member_client_id(uuid) to authenticated;

revoke execute on function private.protect_last_owner() from public;

revoke execute on function private.is_staff(uuid) from public;
grant execute on function private.is_staff(uuid) to authenticated;

revoke execute on function private.can_read_project(uuid) from public;
grant execute on function private.can_read_project(uuid) to authenticated;

revoke execute on function private.can_access_storage_object(text) from public;
grant execute on function private.can_access_storage_object(text) to authenticated;

revoke execute on function private.can_view_profile(uuid) from public;
grant execute on function private.can_view_profile(uuid) to authenticated;

revoke execute on function private.touch_workspace_billing_updated_at() from public;

revoke execute on function private.workspace_plan(uuid) from public;
grant execute on function private.workspace_plan(uuid) to authenticated;

revoke execute on function private.enforce_client_limit() from public;

-- Close this for every function created after this migration too: flip
-- the migration role's own default privileges in schema public so a new
-- SECURITY DEFINER function starts without anon access and has to opt in
-- with an explicit grant, the same way each function above just did.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
