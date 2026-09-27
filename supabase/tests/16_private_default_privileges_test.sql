-- 15_rpc_privileges_test.sql covers the functions that already existed
-- when the anon-execute migrations ran. This file covers what happens to a
-- function created in `private` *after* them: does it still pick up
-- Postgres's built-in "every function is EXECUTE-able by PUBLIC" default,
-- the same gap 15 closed for named-role grants but not for that hardcoded
-- default?
--
-- The obvious-looking fix, `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN
-- SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, turns out not to
-- work: verified by hand against this database, a schema-scoped REVOKE
-- FROM PUBLIC updates the bookkeeping row in pg_default_acl (visible via
-- `\ddp`), but CREATE FUNCTION still merges the hardcoded PUBLIC grant
-- back in regardless of that row's content. Only the schema-unscoped form,
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS
-- FROM PUBLIC` (no `IN SCHEMA`), replaces the hardcoded default; a
-- schema-specific entry for `public` (already in place, granting
-- authenticated/service_role) then layers on top of it instead of being
-- overridden by it. See the accompanying migration for the same finding
-- written out with the exact commands.
BEGIN;
SELECT no_plan();

-- The migration role's schema-unscoped default-privilege entry for
-- functions (defaclnamespace = 0, i.e. "no schema qualifier") exists...
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_default_acl
    WHERE defaclrole = 'postgres'::regrole
      AND defaclnamespace = 0
      AND defaclobjtype = 'f'
  ),
  'postgres has a schema-unscoped default-privilege entry for functions'
);

-- ...and does not grant PUBLIC (the empty-role ACL grantee, oid 0)
-- EXECUTE. That is the entry CREATE FUNCTION actually consults for the
-- hardcoded PUBLIC default; a schema-scoped entry cannot remove it.
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl,
      LATERAL aclexplode(defaclacl) AS a
    WHERE defaclrole = 'postgres'::regrole
      AND defaclnamespace = 0
      AND defaclobjtype = 'f'
      AND a.grantee = 0
  ),
  'that default-privilege entry does not grant PUBLIC EXECUTE'
);

-- Behavioral proof, not just catalog bookkeeping: a function created in
-- `private` right now, by the migration role, inside this test's own
-- transaction, must not be reachable by anon or authenticated. ROLLBACK at
-- the end of the test drops it; nothing needs manual cleanup.
CREATE FUNCTION private.__default_priv_probe() RETURNS void
LANGUAGE sql AS $$ SELECT 1 $$;

SELECT ok(
  NOT has_function_privilege('anon', 'private.__default_priv_probe()', 'EXECUTE'),
  'anon has no EXECUTE on a function just created in private'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.__default_priv_probe()', 'EXECUTE'),
  'authenticated has no EXECUTE on a function just created in private'
);

SELECT * FROM finish();
ROLLBACK;
