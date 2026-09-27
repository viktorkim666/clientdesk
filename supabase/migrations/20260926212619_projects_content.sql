-- Milestone 2: project updates, comments and files, plus the storage bucket
-- and policies that guard the objects behind them.
-- Same style as the init migration: policies only ever call `private.*`
-- security-definer helpers, never the policy's own table.

-- projects needs a composite unique key so project_updates, update_comments
-- and project_files can carry a composite FK (project_id, workspace_id) back
-- to it, the same way projects itself references clients.
alter table public.projects
  add constraint projects_id_workspace_id_key unique (id, workspace_id);

-- Tables ---------------------------------------------------------------

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null,
  author_id uuid not null references auth.users (id),
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  constraint project_updates_body_length check (char_length(body) between 1 and 5000),
  unique (id, project_id)
);

create index project_updates_project_id_created_at_idx on public.project_updates (project_id, created_at desc);
create index project_updates_workspace_id_idx on public.project_updates (workspace_id);

create table public.update_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null,
  update_id uuid not null,
  author_id uuid not null references auth.users (id),
  body text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  -- Ties update_id to the same project_id, so a comment can never be
  -- attached to an update on a different project than the one it names.
  foreign key (update_id, project_id) references public.project_updates (id, project_id) on delete cascade,
  constraint update_comments_body_length check (char_length(body) between 1 and 2000)
);

create index update_comments_update_id_created_at_idx on public.update_comments (update_id, created_at);
create index update_comments_project_id_idx on public.update_comments (project_id);
create index update_comments_workspace_id_idx on public.update_comments (workspace_id);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid not null,
  uploaded_by uuid not null references auth.users (id),
  storage_path text not null unique,
  name text not null,
  size_bytes bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  constraint project_files_size_bytes_positive check (size_bytes > 0)
);

create index project_files_project_id_created_at_idx on public.project_files (project_id, created_at desc);
create index project_files_workspace_id_idx on public.project_files (workspace_id);

-- Private access helpers -------------------------------------------------

-- Staff of the workspace: owner or member.
create or replace function private.is_staff(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.member_role(p_workspace_id) in ('owner', 'member');
$$;

-- Staff of the project's workspace, or the client member whose client_id
-- matches the project's client.
create or replace function private.can_read_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        private.is_staff(p.workspace_id)
        or (
          private.member_role(p.workspace_id) = 'client'
          and private.member_client_id(p.workspace_id) = p.client_id
        )
      )
  );
$$;

-- Reads one `/`-delimited segment of a storage object name and returns it as
-- a uuid, or null if it isn't a well-formed UUID. Validating the shape
-- before casting means a malformed path is denied by the policy instead of
-- raising a cast error.
create or replace function private.storage_path_uuid(p_object_name text, p_segment int)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_object_name, '/', p_segment)
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_object_name, '/', p_segment)::uuid
    else null
  end;
$$;

-- Object names in the project-files bucket follow
-- {workspace_id}/{project_id}/{file_id}/{safe_name}. This checks that both
-- the workspace and project segments are well-formed, that the project
-- segment actually belongs to the workspace segment, and that the caller
-- can read that project.
create or replace function private.can_access_storage_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.storage_path_uuid(p_object_name, 1) is not null
    and private.storage_path_uuid(p_object_name, 2) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = private.storage_path_uuid(p_object_name, 2)
        and p.workspace_id = private.storage_path_uuid(p_object_name, 1)
    )
    and private.can_read_project(private.storage_path_uuid(p_object_name, 2));
$$;

-- Row level security -----------------------------------------------------

alter table public.project_updates enable row level security;
alter table public.update_comments enable row level security;
alter table public.project_files enable row level security;

-- project_updates: owner and member read, post and delete every update on
-- their workspace's projects; the project's client only reads.
create policy project_updates_select on public.project_updates
  for select to authenticated
  using (private.can_read_project(project_id));

create policy project_updates_insert on public.project_updates
  for insert to authenticated
  with check (private.is_staff(workspace_id) and author_id = auth.uid());

create policy project_updates_delete on public.project_updates
  for delete to authenticated
  using (private.is_staff(workspace_id));

-- update_comments: staff and the project's client both read and comment;
-- either side deletes only their own comment.
create policy update_comments_select on public.update_comments
  for select to authenticated
  using (private.can_read_project(project_id));

create policy update_comments_insert on public.update_comments
  for insert to authenticated
  with check (private.can_read_project(project_id) and author_id = auth.uid());

create policy update_comments_delete on public.update_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- project_files: staff and the project's client both read and upload; staff
-- delete any file, the project's client deletes only their own upload.
create policy project_files_select on public.project_files
  for select to authenticated
  using (private.can_read_project(project_id));

create policy project_files_insert on public.project_files
  for insert to authenticated
  with check (private.can_read_project(project_id) and uploaded_by = auth.uid());

create policy project_files_delete on public.project_files
  for delete to authenticated
  using (private.is_staff(workspace_id) or uploaded_by = auth.uid());

-- Storage bucket ----------------------------------------------------------
-- Declared here (not only in config.toml) so hosted projects get it too.
-- Idempotent: a repeat run (or a project created before this migration)
-- still ends up with the same limits.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects policies for the project-files bucket. RLS is already
-- enabled on storage.objects by Supabase; these policies only ever match
-- rows in this bucket.

create policy project_files_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and private.can_access_storage_object(name)
  );

create policy project_files_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and private.can_access_storage_object(name)
  );

-- Delete relies on the object's owner (set by Storage to the uploader) or
-- staff of the workspace named in the path, so an orphaned object (upload
-- succeeded, metadata registration failed) can still be cleaned up by its
-- uploader even before a project_files row exists for it.
create policy project_files_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (
      owner_id = (auth.uid())::text
      or private.is_staff(private.storage_path_uuid(name, 1))
    )
  );

-- RPCs -----------------------------------------------------------------

-- Client users' emails for a project, for the "new update" notification.
-- auth.users isn't readable through RLS, so this is the only way the app can
-- resolve recipients, and only staff of the project's workspace may call it.
create or replace function public.project_update_recipients(p_project_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select workspace_id into v_workspace_id
  from public.projects
  where id = p_project_id;

  if v_workspace_id is null or private.is_staff(v_workspace_id) is not true then
    raise exception 'only staff can read a project''s update recipients';
  end if;

  return query
    select u.email::text
    from public.projects p
    join public.workspace_members wm
      on wm.workspace_id = p.workspace_id
     and wm.client_id = p.client_id
     and wm.role = 'client'
    join auth.users u on u.id = wm.user_id
    where p.id = p_project_id;
end;
$$;

revoke execute on function public.project_update_recipients(uuid) from public;
grant execute on function public.project_update_recipients(uuid) to authenticated;
