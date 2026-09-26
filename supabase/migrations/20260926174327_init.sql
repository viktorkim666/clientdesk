-- Milestone 1: workspaces and roles.
-- Tables, enums, private security-definer helpers, RLS policies, RPCs and the
-- profile-creation trigger. Policies only ever call the `private.*` helpers,
-- so no policy on `workspace_members` queries `workspace_members` itself.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;

create schema if not exists private;

create type public.workspace_role as enum ('owner', 'member', 'client');
create type public.project_status as enum ('active', 'on_hold', 'done');

-- Tables ---------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  client_id uuid,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id),
  constraint workspace_members_client_id_matches_role check (
    (role = 'client' and client_id is not null)
    or (role in ('owner', 'member') and client_id is null)
  )
);

create index workspace_members_client_id_idx on public.workspace_members (client_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  name text not null,
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id)
);

create index projects_workspace_id_idx on public.projects (workspace_id);
create index projects_client_id_idx on public.projects (client_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.workspace_role not null,
  client_id uuid,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id),
  constraint invitations_client_id_matches_role check (
    (role = 'client' and client_id is not null)
    or (role in ('owner', 'member') and client_id is null)
  )
);

create index invitations_workspace_id_idx on public.invitations (workspace_id);

-- Private access helpers -------------------------------------------------
-- security definer + search_path = '' so policies can call these without
-- ever letting a `workspace_members` policy query `workspace_members`
-- through the querying role's own (recursive) RLS.

create or replace function private.member_role(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid();
$$;

create or replace function private.member_client_id(p_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_id
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = auth.uid();
$$;

create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g'));
$$;

-- Row level security -----------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.clients enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.invitations enable row level security;

-- profiles: a user reads and updates only their own row. Row creation is
-- handled by the security-definer trigger below, so there is no insert policy.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- workspaces: owner, member and client all read; only the owner updates.
-- Creation goes through create_workspace(), so there is no insert policy.
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (private.member_role(id) is not null);

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (private.member_role(id) = 'owner')
  with check (private.member_role(id) = 'owner');

-- workspace_members: owner and member read every row; a client reads staff
-- rows and their own. Only the owner changes roles or removes a member.
-- Membership rows are only ever inserted by create_workspace() and
-- accept_invitation(), so there is no insert policy.
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (
    private.member_role(workspace_id) in ('owner', 'member')
    or (
      private.member_role(workspace_id) = 'client'
      and (role <> 'client' or user_id = auth.uid())
    )
  );

create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (private.member_role(workspace_id) = 'owner')
  with check (private.member_role(workspace_id) = 'owner');

create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (private.member_role(workspace_id) = 'owner');

-- clients: owner and member have full access; a client reads only its own row.
create policy clients_select on public.clients
  for select to authenticated
  using (
    private.member_role(workspace_id) in ('owner', 'member')
    or (
      private.member_role(workspace_id) = 'client'
      and private.member_client_id(workspace_id) = id
    )
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (private.member_role(workspace_id) in ('owner', 'member'));

create policy clients_update on public.clients
  for update to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'))
  with check (private.member_role(workspace_id) in ('owner', 'member'));

create policy clients_delete on public.clients
  for delete to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'));

-- projects: owner and member have full access; a client reads only projects
-- that belong to its own client row.
create policy projects_select on public.projects
  for select to authenticated
  using (
    private.member_role(workspace_id) in ('owner', 'member')
    or (
      private.member_role(workspace_id) = 'client'
      and client_id = private.member_client_id(workspace_id)
    )
  );

create policy projects_insert on public.projects
  for insert to authenticated
  with check (private.member_role(workspace_id) in ('owner', 'member'));

create policy projects_update on public.projects
  for update to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'))
  with check (private.member_role(workspace_id) in ('owner', 'member'));

create policy projects_delete on public.projects
  for delete to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'));

-- invitations: the owner invites any role and revokes; a member invites
-- clients only. A client, and anyone not a member, sees nothing.
create policy invitations_select on public.invitations
  for select to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      private.member_role(workspace_id) = 'owner'
      or (private.member_role(workspace_id) = 'member' and role = 'client')
    )
  );

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (private.member_role(workspace_id) = 'owner');

-- Last-owner protection ----------------------------------------------------
-- Enforced as a trigger, not a policy, so it also protects the RPCs below
-- (which run as security definer and bypass RLS).

create or replace function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining_owners integer;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into v_remaining_owners
  from public.workspace_members
  where workspace_id = old.workspace_id
    and role = 'owner'
    and user_id <> old.user_id;

  if v_remaining_owners = 0 then
    raise exception 'cannot remove or demote the last owner of a workspace';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_last_owner_trigger
  before update or delete on public.workspace_members
  for each row execute function private.protect_last_owner();

-- Profile creation trigger --------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RPCs -----------------------------------------------------------------
-- Multi-row writes that must be atomic and must not need broad insert
-- policies on workspace_members / invitations.

create or replace function public.create_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'workspace name is required';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (
    trim(p_name),
    private.slugify(p_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
    auth.uid()
  )
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role, client_id)
  values (v_workspace.id, auth.uid(), 'owner', null);

  return v_workspace;
end;
$$;

revoke execute on function public.create_workspace(text) from public;
grant execute on function public.create_workspace(text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns public.workspace_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_member public.workspace_members;
  v_user_email text;
  v_token_hash text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_token is null or length(p_token) = 0 then
    raise exception 'invitation token is required';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_invitation
  from public.invitations
  where token_hash = v_token_hash
  for update;

  if v_invitation.id is null then
    raise exception 'invalid invitation token';
  end if;

  if v_invitation.accepted_at is not null then
    raise exception 'invitation was already accepted';
  end if;

  if v_invitation.expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();

  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'invitation email does not match the signed-in user';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, client_id)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role, v_invitation.client_id)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role,
        client_id = excluded.client_id
  returning * into v_member;

  update public.invitations
  set accepted_at = now()
  where id = v_invitation.id;

  return v_member;
end;
$$;

revoke execute on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;
