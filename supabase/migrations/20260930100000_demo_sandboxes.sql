-- Milestone 5: demo sandboxes. A visitor gets a private copy of the
-- Northwind Studio template (supabase/demo/template.sql) with fresh users,
-- and the copy is deleted after 24 hours. This migration adds the tables that
-- record the template and its sandboxes, the function that clones the
-- template, and the two functions the daily cron calls to remove expired
-- sandboxes (delete_expired_demo_sandboxes, then finish_demo_sandbox_cleanup
-- once the users, blobs and Stripe customers are gone). Creating the users,
-- copying the Storage blobs and deleting them again all live in application
-- code (they need the admin API), never here. Three guards keep a visitor
-- inside the sandbox: no workspace of their own, no invitations, and no
-- change of the address or phone on their account.

-- Pinned billing ---------------------------------------------------------

-- A sandbox workspace is pinned to Pro without ever talking to Stripe, so its
-- billing row has no customer. Every existing row still has one, and the
-- unique constraint keeps allowing any number of nulls.
alter table public.workspace_billing
  alter column stripe_customer_id drop not null;

-- Tables ---------------------------------------------------------------

-- Names the template workspace and the moment its timestamps count back
-- from. template.sql writes this row together with the workspace (and
-- deletes it with the workspace, through the cascade), so the clone function
-- never hardcodes either value: it shifts every timestamp by now() - anchor.
create table public.demo_template (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  anchor timestamptz not null
);

-- There is one template. The clone function reads "the" row, so a second row
-- would make it pick one at random.
create unique index demo_template_singleton on public.demo_template ((true));

-- One row per sandbox. The four user ids are plain columns, not foreign
-- keys: the cron reads them to know which users to delete through the admin
-- API after the workspaces are gone, and a foreign key would tie the
-- sandbox row's life to a user the cron has not removed yet. Each user
-- belongs to one sandbox at most. visitor_hash is the salted hash of the
-- visitor's address, never the address itself.
--
-- The row outlives its workspaces. Cleanup is two steps: delete_expired_demo_
-- sandboxes deletes the workspaces (the workspace columns go null), stamps
-- deleted_at and keeps what the server still needs (the blob paths and the
-- Stripe customers, which the deleted rows can no longer tell), and
-- finish_demo_sandbox_cleanup deletes the row once the server has removed
-- the users, blobs and customers. A sandbox whose server step failed is
-- returned again by the next run instead of being forgotten.
create table public.demo_sandboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid unique references public.workspaces (id) on delete set null,
  free_workspace_id uuid unique references public.workspaces (id) on delete set null,
  owner_user_id uuid not null unique,
  member_user_id uuid not null unique,
  client_one_user_id uuid not null unique,
  client_two_user_id uuid not null unique,
  visitor_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  deleted_at timestamptz,
  pending_storage_paths text[] not null default '{}',
  pending_stripe_customer_ids text[] not null default '{}'
);

-- Back the counts create_demo_sandbox runs on every call (last hour, per
-- visitor, live) and the expiry scan in delete_expired_demo_sandboxes.
create index demo_sandboxes_created_at_idx on public.demo_sandboxes (created_at desc);
create index demo_sandboxes_visitor_hash_created_at_idx on public.demo_sandboxes (visitor_hash, created_at desc);
create index demo_sandboxes_expires_at_idx on public.demo_sandboxes (expires_at);

-- Row level security -----------------------------------------------------

alter table public.demo_template enable row level security;
alter table public.demo_sandboxes enable row level security;

-- demo_template has no policy and no grant: only the functions below (as
-- their definer) and the seed role read it.
revoke all on public.demo_template from anon, authenticated;

-- A member of a sandbox reads that sandbox's row, so the app can tell it is
-- inside a demo (for the banner and the note on the billing page). Nothing
-- else needs the table through the API, so the grant is narrower than the
-- policy: the visitor hash and the user ids stay unreadable. The role switch
-- and the cron look up the user ids with the admin client.
create policy demo_sandboxes_select on public.demo_sandboxes
  for select to authenticated
  using (
    private.member_role(workspace_id) is not null
    or private.member_role(free_workspace_id) is not null
  );

revoke all on public.demo_sandboxes from anon, authenticated;
grant select (id, workspace_id, free_workspace_id, expires_at) on public.demo_sandboxes to authenticated;

-- Private helpers ------------------------------------------------------

-- True for both workspaces of a sandbox. Later demo limits (AI drafts,
-- uploads) call this from their own security definer functions and
-- triggers, so it needs no grant to authenticated: the app reads
-- demo_sandboxes through the policy above instead.
create or replace function private.is_demo_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_sandboxes
    where workspace_id = p_workspace_id
       or free_workspace_id = p_workspace_id
  );
$$;

-- True for a user of any sandbox, in any of the four roles. create_workspace
-- refuses these users: a workspace of their own would sit outside the
-- sandbox, and its sole-owner membership would block deleting the user.
create or replace function private.is_demo_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demo_sandboxes
    where p_user_id in (
      owner_user_id, member_user_id, client_one_user_id, client_two_user_id
    )
  );
$$;

-- Every workspace cleanup must delete for one sandbox: its two, and any
-- other workspace whose only owners are the sandbox's own users (defence for
-- a workspace that got past create_workspace's refusal). A workspace that
-- has an owner outside the sandbox stays.
create or replace function private.demo_sandbox_workspace_ids(p_sandbox_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  where w.id in (
      select s.workspace_id from public.demo_sandboxes s where s.id = p_sandbox_id
      union
      select s.free_workspace_id from public.demo_sandboxes s where s.id = p_sandbox_id
    )
    or w.id in (
      select m.workspace_id
      from public.demo_sandboxes s
      join public.workspace_members m
        on m.role = 'owner'
       and m.user_id in (
         s.owner_user_id, s.member_user_id, s.client_one_user_id, s.client_two_user_id
       )
      where s.id = p_sandbox_id
        and not exists (
          select 1
          from public.workspace_members o
          where o.workspace_id = m.workspace_id
            and o.role = 'owner'
            and o.user_id not in (
              s.owner_user_id, s.member_user_id, s.client_one_user_id, s.client_two_user_id
            )
        )
    );
$$;

-- Why a new sandbox would be refused right now: 'demo_capacity' (40 created
-- in the last hour, or 300 live) or 'demo_visitor_limit' (3 in the last hour
-- for this visitor), else 'ok'. create_demo_sandbox raises on it under its
-- lock; demo_can_start reports it without a lock so the server can skip
-- creating four users for a request that is going to be refused.
create or replace function private.demo_capacity_status(p_visitor_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (
      select count(*) from public.demo_sandboxes
      where created_at > now() - interval '1 hour'
    ) >= 40 then 'demo_capacity'
    when (
      select count(*) from public.demo_sandboxes
      where expires_at > now()
    ) >= 300 then 'demo_capacity'
    when (
      select count(*) from public.demo_sandboxes
      where visitor_hash = p_visitor_hash
        and created_at > now() - interval '1 hour'
    ) >= 3 then 'demo_visitor_limit'
    else 'ok'
  end;
$$;

-- Guards -------------------------------------------------------------------

-- A sandbox user cannot own a workspace outside the sandbox. The body is
-- the one from the init migration, with the refusal added.
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

  if private.is_demo_user(auth.uid()) then
    raise exception using
      message = 'demo_workspace_forbidden',
      errcode = 'CD009';
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

-- Nobody is invited into a sandbox, whatever role sends the insert. The app
-- refuses first; this holds even for a caller that skips the app.
create or replace function private.block_demo_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_demo_workspace(new.workspace_id) then
    raise exception using
      message = 'demo_invites_disabled',
      errcode = 'CD010';
  end if;
  return new;
end;
$$;

create trigger block_demo_invitations
  before insert on public.invitations
  for each row execute function private.block_demo_invitations();

-- A sandbox user's address and phone never change. GoTrue's
-- `updateUser({ email })` writes the new address to email_change and mails a
-- confirmation link to it, so the visitor could make the project send mail
-- to any inbox. Nothing in the app changes these columns for a demo user
-- (deleting one is not an update), so the lock holds for every role,
-- including the supabase_auth_admin that GoTrue runs as. Unchanged values
-- pass, so a full-row update from GoTrue still works.
create or replace function private.lock_demo_user_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(old.email, '')) like '%@demo.clientdesk.invalid'
    and (
      coalesce(new.email, '') is distinct from coalesce(old.email, '')
      or coalesce(new.phone, '') is distinct from coalesce(old.phone, '')
      or coalesce(new.email_change, '') is distinct from coalesce(old.email_change, '')
      or coalesce(new.phone_change, '') is distinct from coalesce(old.phone_change, '')
    )
  then
    raise exception using
      message = 'demo_user_contact_locked',
      errcode = 'CD011';
  end if;
  return new;
end;
$$;

create trigger lock_demo_user_contact
  before update of email, phone, email_change, phone_change on auth.users
  for each row execute function private.lock_demo_user_contact();

-- Deleting a workspace ------------------------------------------------------

-- Nothing in the app deletes a workspace, so protect_last_owner never had to
-- allow it: deleting one cascades to its members, and the trigger then
-- refused to remove the last owner. Expiring a sandbox and re-running
-- template.sql both delete whole workspaces. When the cascade reaches the
-- member rows the workspace row is already gone, so a missing workspace
-- means the whole workspace is being deleted, not one owner removed from a
-- workspace that goes on. Everything else in the function is unchanged.
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

  if tg_op = 'DELETE'
    and not exists (select 1 from public.workspaces where id = old.workspace_id)
  then
    return old;
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

-- RPCs -----------------------------------------------------------------

-- Copies the template into a new sandbox: the Pro workspace with all its
-- rows under new UUIDs, plus a second Free workspace, and records both in
-- demo_sandboxes. The caller (a server action using the secret key) has
-- already created the four users and passes their ids. Returns the new
-- workspace ids and slugs and, for every file row, the template storage path
-- and the new one, so the server can copy the blobs.
--
-- Everything happens in the calling transaction: either the whole sandbox
-- exists afterwards or nothing does.
create or replace function public.create_demo_sandbox(
  p_owner uuid,
  p_member uuid,
  p_client_one uuid,
  p_client_two uuid,
  p_visitor_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_anchor timestamptz;
  v_shift interval;
  v_workspace_id uuid := gen_random_uuid();
  v_free_id uuid := gen_random_uuid();
  v_slug text;
  v_free_slug text;
  v_free_client_id uuid := gen_random_uuid();
  v_status text;
  v_map jsonb;
  v_users jsonb;
  v_files jsonb;
  v_expires_at timestamptz;
begin
  -- One global lock for every clone, so the counts below and the insert at
  -- the end run one caller at a time. Two callers racing each other could
  -- otherwise both count 39, both pass, and end up at 41. Clones are rare
  -- (one per demo click) and short, so queueing on this costs nothing.
  perform pg_advisory_xact_lock(hashtext('create_demo_sandbox'));

  -- The caps protect the free database from a bot loop (see
  -- private.demo_capacity_status for the numbers). The error names no
  -- internals, the same way claim_ai_draft keeps its own messages short.
  v_status := private.demo_capacity_status(p_visitor_hash);
  if v_status = 'demo_capacity' then
    raise exception using
      message = 'demo_capacity',
      errcode = 'CD006';
  elsif v_status = 'demo_visitor_limit' then
    raise exception using
      message = 'demo_visitor_limit',
      errcode = 'CD007';
  end if;

  -- Shared lock on the template row: re-running template.sql deletes and
  -- rewrites it, and that must wait for a clone in flight instead of
  -- interleaving with it.
  select workspace_id, anchor into v_template_id, v_anchor
  from public.demo_template
  limit 1
  for share;

  if v_template_id is null then
    raise exception using
      message = 'demo_template_missing',
      errcode = 'CD008';
  end if;

  v_shift := now() - v_anchor;
  v_slug := 'northwind-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_free_slug := 'northwind-labs-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  -- Old id -> new id for every row that keeps a foreign key to another
  -- copied row. Ids are unique across these tables (each has its own UUID
  -- prefix in the template and random ids in real data), so one map is
  -- enough.
  select jsonb_object_agg(t.id::text, gen_random_uuid()::text) into v_map
  from (
    select id from public.clients where workspace_id = v_template_id
    union all
    select id from public.projects where workspace_id = v_template_id
    union all
    select id from public.project_updates where workspace_id = v_template_id
    union all
    select id from public.update_comments where workspace_id = v_template_id
    union all
    select id from public.project_files where workspace_id = v_template_id
  ) t;

  -- Template user id -> sandbox user id: the owner and the member by role,
  -- the two client users in the order of the clients they belong to (oldest
  -- client first).
  select jsonb_object_agg(r.user_id::text, (
    case r.role
      when 'owner' then p_owner
      when 'member' then p_member
      else case r.client_rank when 1 then p_client_one else p_client_two end
    end
  )::text) into v_users
  from (
    select
      m.user_id,
      m.role,
      row_number() over (partition by m.role order by c.created_at, m.user_id) as client_rank
    from public.workspace_members m
    left join public.clients c on c.id = m.client_id
    where m.workspace_id = v_template_id
  ) r;

  -- A template with no rows (or no members) would clone an empty workspace.
  if v_map is null or v_users is null then
    raise exception using
      message = 'demo_template_empty',
      errcode = 'CD008';
  end if;

  insert into public.workspaces (id, name, slug, created_by, created_at)
  select v_workspace_id, w.name, v_slug, p_owner, w.created_at + v_shift
  from public.workspaces w
  where w.id = v_template_id;

  -- Pro billing first: on the Free plan the client-limit trigger refuses a
  -- third client, and the template has five. Pinned, with no Stripe
  -- customer, so billing sync and the webhook never find a row to touch.
  insert into public.workspace_billing (workspace_id, stripe_customer_id, subscription_status)
  values (v_workspace_id, null, 'active');

  insert into public.clients (id, workspace_id, name, created_at)
  select (v_map ->> c.id::text)::uuid, v_workspace_id, c.name, c.created_at + v_shift
  from public.clients c
  where c.workspace_id = v_template_id;

  insert into public.workspace_members (workspace_id, user_id, role, client_id, created_at)
  select
    v_workspace_id,
    (v_users ->> m.user_id::text)::uuid,
    m.role,
    (v_map ->> m.client_id::text)::uuid,
    m.created_at + v_shift
  from public.workspace_members m
  where m.workspace_id = v_template_id;

  insert into public.projects (id, workspace_id, client_id, name, status, created_at)
  select
    (v_map ->> p.id::text)::uuid,
    v_workspace_id,
    (v_map ->> p.client_id::text)::uuid,
    p.name,
    p.status,
    p.created_at + v_shift
  from public.projects p
  where p.workspace_id = v_template_id;

  insert into public.project_updates (id, workspace_id, project_id, author_id, body, created_at)
  select
    (v_map ->> u.id::text)::uuid,
    v_workspace_id,
    (v_map ->> u.project_id::text)::uuid,
    (v_users ->> u.author_id::text)::uuid,
    u.body,
    u.created_at + v_shift
  from public.project_updates u
  where u.workspace_id = v_template_id;

  insert into public.update_comments (id, workspace_id, project_id, update_id, author_id, body, created_at)
  select
    (v_map ->> c.id::text)::uuid,
    v_workspace_id,
    (v_map ->> c.project_id::text)::uuid,
    (v_map ->> c.update_id::text)::uuid,
    (v_users ->> c.author_id::text)::uuid,
    c.body,
    c.created_at + v_shift
  from public.update_comments c
  where c.workspace_id = v_template_id;

  -- storage_path is <workspace id>/<project id>/<file id>/<name>, the format
  -- src/lib/files/storage-path.ts builds and the storage policies parse.
  insert into public.project_files (id, workspace_id, project_id, uploaded_by, storage_path, name, size_bytes, mime_type, created_at)
  select
    (v_map ->> f.id::text)::uuid,
    v_workspace_id,
    (v_map ->> f.project_id::text)::uuid,
    (v_users ->> f.uploaded_by::text)::uuid,
    format('%s/%s/%s/%s', v_workspace_id, v_map ->> f.project_id::text, v_map ->> f.id::text, f.name),
    f.name,
    f.size_bytes,
    f.mime_type,
    f.created_at + v_shift
  from public.project_files f
  where f.workspace_id = v_template_id;

  -- The users came from the admin API, so their profiles exist but carry no
  -- name. Give them the template's, so the sandbox reads "Maya Chen".
  update public.profiles p
  set full_name = tp.full_name
  from jsonb_each_text(v_users) u
  join public.profiles tp on tp.id = u.key::uuid
  where p.id = u.value::uuid;

  -- The second workspace stays on the Free plan (no billing row), so the
  -- visitor can run a real Stripe test checkout there.
  insert into public.workspaces (id, name, slug, created_by)
  values (v_free_id, 'Northwind Labs', v_free_slug, p_owner);

  insert into public.workspace_members (workspace_id, user_id, role, client_id)
  values (v_free_id, p_owner, 'owner', null);

  insert into public.clients (id, workspace_id, name)
  values (v_free_client_id, v_free_id, 'Willow Cafe');

  insert into public.projects (workspace_id, client_id, name)
  values (v_free_id, v_free_client_id, 'Menu website');

  insert into public.demo_sandboxes (
    workspace_id, free_workspace_id,
    owner_user_id, member_user_id, client_one_user_id, client_two_user_id,
    visitor_hash
  )
  values (
    v_workspace_id, v_free_id,
    p_owner, p_member, p_client_one, p_client_two,
    p_visitor_hash
  )
  returning expires_at into v_expires_at;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('from', t.storage_path, 'to', c.storage_path)
      order by t.storage_path
    ),
    '[]'::jsonb
  ) into v_files
  from public.project_files t
  join public.project_files c on c.id = (v_map ->> t.id::text)::uuid
  where t.workspace_id = v_template_id;

  return jsonb_build_object(
    'workspace_id', v_workspace_id,
    'workspace_slug', v_slug,
    'free_workspace_id', v_free_id,
    'free_workspace_slug', v_free_slug,
    'expires_at', v_expires_at,
    'files', v_files
  );
end;
$$;

-- Only the server, with the secret key, calls this. `revoke ... from
-- public` alone would leave the by-name grants Supabase's default
-- privileges add, so anon and authenticated are revoked explicitly.
revoke execute on function public.create_demo_sandbox(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_demo_sandbox(uuid, uuid, uuid, uuid, text) to service_role;

-- Whether a sandbox may be created for this visitor right now: 'ok',
-- 'demo_capacity' or 'demo_visitor_limit'. A cheap read the server makes
-- before it creates any user. create_demo_sandbox stays the authority: it
-- checks again under its lock, so a race between the two is still refused.
create or replace function public.demo_can_start(p_visitor_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.demo_capacity_status(p_visitor_hash);
$$;

revoke execute on function public.demo_can_start(text) from public, anon, authenticated;
grant execute on function public.demo_can_start(text) to service_role;

-- Step one of the cleanup. Takes a batch of at most 25 expired sandboxes
-- (ones not yet touched first, then earlier ones that were not finished, so
-- a stuck sandbox never starves new ones) and, for the untouched ones, saves
-- the blob paths and Stripe customers into the row, then deletes the
-- workspaces: both of the sandbox and any other workspace only its users
-- own. Users stay: deleting them is the server's job (the admin API).
-- Returns, per sandbox, what the server must still remove, plus a sweep of
-- stray demo users (created for a sandbox that died half way, so no row
-- names them) and the count of AI draft requests deleted. The
-- claim_ai_draft milestone deferred draft-request retention to this
-- milestone, so the 7-day cleanup rides along here.
--
-- Nothing is lost when the server fails part way: the rows stay until
-- finish_demo_sandbox_cleanup, and the next run returns them again.
create or replace function public.delete_expired_demo_sandboxes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_fresh uuid[];
  v_sandboxes jsonb;
  v_orphans uuid[];
  v_drafts int;
begin
  select coalesce(array_agg(b.id), '{}')
  into v_ids
  from (
    select s.id
    from public.demo_sandboxes s
    where s.expires_at <= now()
    order by (s.deleted_at is not null), coalesce(s.deleted_at, s.expires_at), s.id
    limit 25
    for update skip locked
  ) b;

  -- Read the paths and customers before the delete: the cascade removes the
  -- file and billing rows. Pinned Pro rows have no customer and drop out.
  with marked as (
    update public.demo_sandboxes s
    set
      deleted_at = now(),
      pending_storage_paths = coalesce((
        select array_agg(f.storage_path order by f.storage_path)
        from public.project_files f
        where f.workspace_id in (select w from private.demo_sandbox_workspace_ids(s.id) w)
      ), '{}'),
      pending_stripe_customer_ids = coalesce((
        select array_agg(b.stripe_customer_id order by b.stripe_customer_id)
        from public.workspace_billing b
        where b.workspace_id in (select w from private.demo_sandbox_workspace_ids(s.id) w)
          and b.stripe_customer_id is not null
      ), '{}')
    where s.id = any (v_ids)
      and s.deleted_at is null
    returning s.id
  )
  select coalesce(array_agg(m.id), '{}') into v_fresh from marked m;

  -- The foreign keys set the sandbox's workspace columns to null.
  delete from public.workspaces
  where id in (
    select w
    from unnest(v_fresh) as f (id),
      lateral private.demo_sandbox_workspace_ids(f.id) as w
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'user_ids', to_jsonb(array[
        s.owner_user_id, s.member_user_id, s.client_one_user_id, s.client_two_user_id
      ]),
      'storage_paths', to_jsonb(s.pending_storage_paths),
      'stripe_customer_ids', to_jsonb(s.pending_stripe_customer_ids)
    )
    order by s.expires_at, s.id
  ), '[]'::jsonb)
  into v_sandboxes
  from public.demo_sandboxes s
  where s.id = any (v_ids);

  -- Users on the demo domain that no sandbox row and no workspace claims,
  -- old enough (25 hours: a sandbox lives 24) that no creation is still in
  -- flight. Template users are members of the template workspace, so the
  -- membership test keeps them out.
  select coalesce(array_agg(o.id), '{}')
  into v_orphans
  from (
    select u.id
    from auth.users u
    where u.email ilike '%@demo.clientdesk.invalid'
      and u.created_at < now() - interval '25 hours'
      and not exists (
        select 1 from public.workspace_members m where m.user_id = u.id
      )
      and not exists (
        select 1 from public.demo_sandboxes s
        where u.id in (
          s.owner_user_id, s.member_user_id, s.client_one_user_id, s.client_two_user_id
        )
      )
    order by u.created_at, u.id
    limit 100
  ) o;

  with deleted as (
    delete from public.ai_draft_requests
    where created_at < now() - interval '7 days'
    returning 1
  )
  select count(*) into v_drafts from deleted;

  return jsonb_build_object(
    'sandboxes', v_sandboxes,
    'orphan_user_ids', to_jsonb(v_orphans),
    'draft_requests_deleted', v_drafts
  );
end;
$$;

revoke execute on function public.delete_expired_demo_sandboxes() from public, anon, authenticated;
grant execute on function public.delete_expired_demo_sandboxes() to service_role;

-- Step two: the server removed these sandboxes' users, blobs and Stripe
-- customers, so the rows can go. Only rows that step one already handled are
-- removed, so an id sent too early does nothing. Returns how many rows went.
create or replace function public.finish_demo_sandbox_cleanup(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.demo_sandboxes
    where id = any (p_ids)
      and deleted_at is not null
    returning 1
  )
  select count(*) into v_count from gone;

  return v_count;
end;
$$;

revoke execute on function public.finish_demo_sandbox_cleanup(uuid[]) from public, anon, authenticated;
grant execute on function public.finish_demo_sandbox_cleanup(uuid[]) to service_role;
