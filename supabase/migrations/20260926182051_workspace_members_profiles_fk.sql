-- Lets PostgREST embed `profiles` when selecting from `workspace_members`
-- (used by the members page). workspace_members.user_id already has a
-- foreign key to auth.users(id); profiles.id always equals auth.users.id
-- (see handle_new_user()), so this second foreign key on the same column is
-- safe and adds the relationship PostgREST needs without changing what rows
-- are allowed to exist.
alter table public.workspace_members
  add constraint workspace_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
