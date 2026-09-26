-- Lets a user also read the profiles of people who share a workspace with
-- them, scoped the same way workspace_members visibility is: a client sees
-- staff and themselves only, never another client's profile. Needed for the
-- workspace members page (milestone 1, task 7).
--
-- security definer + search_path = '' so this never recurses through
-- profiles' own RLS, the same pattern as private.member_role().

create or replace function private.can_view_profile(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_target_user_id
      and (
        mine.role in ('owner', 'member')
        or (mine.role = 'client' and theirs.role <> 'client')
      )
  );
$$;

-- Additive: combines with the existing "id = auth.uid()" select policy via OR.
create policy profiles_select_shared on public.profiles
  for select to authenticated
  using (private.can_view_profile(id));
