-- CHECK constraints matching the Zod limits in
-- src/lib/validation/{client,project,workspace}.ts, so a name too short or
-- too long is rejected at the DB level too, not only by the client-side
-- schema (nothing stops a direct insert, or a future caller, from skipping
-- Zod). Existing seed data is well within these limits.
--
-- Added as NOT VALID, then validated in a separate statement. A plain
-- `ADD CONSTRAINT ... CHECK (...)` takes an ACCESS EXCLUSIVE lock for the
-- whole table scan; NOT VALID takes that same lock only for the instant
-- metadata change, and the later VALIDATE CONSTRAINT takes just a SHARE
-- UPDATE EXCLUSIVE lock while it scans (reads and writes on the table
-- continue). See "ALTER TABLE ... VALIDATE CONSTRAINT" in the Postgres
-- docs. New rows are checked immediately either way; only pre-existing
-- rows wait for the validate step.
--
-- VALIDATE CONSTRAINT still fails the migration if a pre-existing row is
-- already out of range — it doesn't touch the data, it just enforces the
-- same CHECK against it. Before running this migration against a database
-- with real rows, check for violations first:
--
--   select id, name from public.workspaces where char_length(name) not between 1 and 60;
--   select id, name from public.clients where char_length(name) not between 1 and 100;
--   select id, name from public.projects where char_length(name) not between 1 and 120;
--
-- If any come back, that's a decision for whoever owns the data (trim,
-- rename, or drop those rows) — this migration won't silently truncate or
-- otherwise mutate rows it didn't create.

alter table public.workspaces
  add constraint workspaces_name_length check (char_length(name) between 1 and 60) not valid;
alter table public.workspaces
  validate constraint workspaces_name_length;

alter table public.clients
  add constraint clients_name_length check (char_length(name) between 1 and 100) not valid;
alter table public.clients
  validate constraint clients_name_length;

alter table public.projects
  add constraint projects_name_length check (char_length(name) between 1 and 120) not valid;
alter table public.projects
  validate constraint projects_name_length;
