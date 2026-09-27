-- Per Supabase's RLS performance guidance, a bare `auth.uid()` in a
-- policy's USING/WITH CHECK is re-evaluated once per row; wrapping it as
-- `(select auth.uid())` turns it into an initPlan Postgres evaluates once
-- per statement instead. Each policy below is dropped and recreated with
-- identical logic, only the wrapping changed.

-- profiles -----------------------------------------------------------------

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspace_members ----------------------------------------------------

drop policy workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (
    private.member_role(workspace_id) in ('owner', 'member')
    or (
      private.member_role(workspace_id) = 'client'
      and (role <> 'client' or user_id = (select auth.uid()))
    )
  );

-- invitations ------------------------------------------------------------

drop policy invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and (
      private.member_role(workspace_id) = 'owner'
      or (private.member_role(workspace_id) = 'member' and role = 'client')
    )
  );

-- project_updates --------------------------------------------------------

drop policy project_updates_insert on public.project_updates;
create policy project_updates_insert on public.project_updates
  for insert to authenticated
  with check (private.is_staff(workspace_id) and author_id = (select auth.uid()));

-- update_comments ---------------------------------------------------------

drop policy update_comments_insert on public.update_comments;
create policy update_comments_insert on public.update_comments
  for insert to authenticated
  with check (private.can_read_project(project_id) and author_id = (select auth.uid()));

drop policy update_comments_delete on public.update_comments;
create policy update_comments_delete on public.update_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- project_files -------------------------------------------------------

drop policy project_files_insert on public.project_files;
create policy project_files_insert on public.project_files
  for insert to authenticated
  with check (private.can_read_project(project_id) and uploaded_by = (select auth.uid()));

drop policy project_files_delete on public.project_files;
create policy project_files_delete on public.project_files
  for delete to authenticated
  using (private.is_staff(workspace_id) or uploaded_by = (select auth.uid()));

-- storage.objects (project-files bucket) ----------------------------------

drop policy project_files_storage_delete on storage.objects;
create policy project_files_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (
      owner_id = ((select auth.uid()))::text
      or private.is_staff(private.storage_path_uuid(name, 1))
    )
  );

-- ai_draft_requests --------------------------------------------------------

drop policy ai_draft_requests_select on public.ai_draft_requests;
create policy ai_draft_requests_select on public.ai_draft_requests
  for select to authenticated
  using (user_id = (select auth.uid()));
