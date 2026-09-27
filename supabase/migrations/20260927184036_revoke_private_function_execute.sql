-- Closes the rest of the gap 20260927170311_revoke_anon_rpc_execute.sql
-- left in schema private: that migration's by-name revoke list only
-- covered the schema's SECURITY DEFINER functions (found via `p.prosecdef`
-- in the same style of query 15_rpc_privileges_test.sql uses). A plain,
-- invoker-rights helper never picked up Supabase's public-schema default
-- privileges either, so it still had Postgres's built-in "every function
-- is EXECUTE-able by PUBLIC" grant, unrevoked -- private.slugify and
-- private.storage_path_uuid, specifically.
--
-- Revoking from the whole schema at once, instead of continuing the
-- by-name list, means the next function added to private starts private
-- by default: someone has to grant authenticated back by name, the same
-- way storage_path_uuid does below, rather than a reviewer having to
-- notice a missing revoke line again.
revoke execute on all functions in schema private from public, anon;

-- private.storage_path_uuid is the one function in this schema that is
-- both plain (invoker-rights, not security definer) and called directly
-- by a policy: project_files_storage_delete evaluates
-- `private.is_staff(private.storage_path_uuid(name, 1))` as the querying
-- role, so authenticated needs EXECUTE on it directly, the same reason the
-- security definer helpers below it already have their own grant.
grant execute on function private.storage_path_uuid(text, int) to authenticated;

-- private.workspace_plan picked up an authenticated grant in
-- 20260927170311_revoke_anon_rpc_execute.sql as if a policy called it
-- directly, but it doesn't: only private.enforce_client_limit (a trigger)
-- and public.claim_ai_draft (its own SECURITY DEFINER RPC) call it, and
-- both already run with private's privileges, not the caller's.
revoke execute on function private.workspace_plan(uuid) from authenticated;
