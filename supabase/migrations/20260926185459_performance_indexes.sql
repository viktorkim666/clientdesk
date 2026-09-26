-- workspace_members' primary key is (workspace_id, user_id), which doesn't
-- help a lookup by user_id alone (e.g. "every workspace this user belongs
-- to", used by the workspace switcher). clients has no index on
-- workspace_id at all: its only index is the unique (id, workspace_id)
-- constraint, which leads with `id` and so doesn't help "clients in this
-- workspace" lookups either.

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index clients_workspace_id_idx on public.clients (workspace_id);
