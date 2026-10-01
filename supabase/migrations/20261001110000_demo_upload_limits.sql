-- Milestone 5: upload limits inside a demo sandbox. A visitor may register at
-- most 5 uploaded files in a sandbox over its whole life, each at most 2 MB,
-- as an image (PNG, JPEG, WebP, GIF) or a PDF. Outside a sandbox nothing
-- changes: the bucket's own 10 MiB limit and MIME allowlist still apply.
--
-- Two layers, because an upload is two steps (the browser puts the object in
-- Storage, then the app registers a project_files row):
--
-- 1. A before-insert trigger on project_files refuses a 6th upload, a file
--    over 2 MB and a type outside the list, with errcode CD005. The message
--    says which: demo_upload_count_limit, demo_upload_size_limit,
--    demo_upload_type_limit, demo_upload_object_missing when Storage holds
--    no object (or no size and type) for the row, or demo_upload_path_invalid
--    when the row's path is not under its own workspace and project. The size
--    and type come from the object in storage.objects, which Storage fills in
--    from the bytes it received, not from the row, which the browser writes
--    (no byte sniffing: the type limit trusts the Content-Type Storage
--    recorded). The trigger answers only members of the workspace; for anyone
--    else it steps aside and row level security gives its usual error, so a
--    limit message never reveals anything about a sandbox. The app shows its
--    own text for each reason.
-- 2. A tighter storage insert policy caps the number of objects under a
--    sandbox workspace's prefix, accepts only canonical paths there, and
--    refuses a name a file row already uses (so an object deleted after its
--    file was registered cannot be replaced with another one). The count runs
--    under a per-workspace lock, so concurrent direct uploads cannot all pass
--    on the same count.
--
-- Residual risk, accepted: Storage cannot check an object's size or type in
-- an insert policy (the policy sees the name and owner, not the bytes). A
-- visitor can therefore still upload objects straight to Storage without
-- registering them, delete them, and repeat. Those uploads are not counted in
-- the 5 (the ledger counts registered files only). What bounds them is the
-- object cap at any one moment, the bucket's 10 MiB per object and MIME
-- allowlist, and the sandbox's 24 hour life: every object under the sandbox
-- prefixes is removed with it (delete_expired_demo_sandboxes collects them,
-- with or without a file row).

-- Which rows count ---------------------------------------------------------

-- "New files" means files a visitor added, not the ones cloned from the
-- template. The trigger below sets this column itself: a row inserted while
-- its workspace is already a sandbox is an upload. create_demo_sandbox
-- copies the template's file rows before it records the sandbox (it inserts
-- the demo_sandboxes row last), so cloned rows come out false without that
-- function changing. A column is exact where comparing created_at with the
-- sandbox's created_at would not be: the clone and a test fixture can share
-- one transaction timestamp. The storage cap below counts the rows where it
-- is false, the template copies.
alter table public.project_files
  add column uploaded_in_demo boolean not null default false;

-- A policy-less table has no UPDATE policy, so RLS already refuses an update
-- from the API; this removes the privilege as well, so uploaded_in_demo
-- (which raises the storage cap when set to false) cannot be changed by a
-- role the API serves even if a policy is added later by mistake. Nothing in
-- the app updates project_files.
revoke update on public.project_files from anon, authenticated;

-- The upload ledger -----------------------------------------------------------

-- One row per upload registered in a sandbox. Deleting a file, a project or
-- a client removes the project_files row, so counting those would let a
-- visitor delete their way back to zero; the ledger has no foreign key to any
-- of them, is written only by the trigger below (security definer) and is not
-- granted to any API role. The limit is on uploads over the sandbox's life,
-- so deleting a file frees no slot. The rows go when
-- finish_demo_sandbox_cleanup removes the sandbox, or after 48 hours at the
-- latest.
create table public.demo_upload_usage (
  id uuid primary key default gen_random_uuid(),
  -- demo_sandboxes.id, deliberately not a foreign key.
  sandbox_id uuid not null,
  created_at timestamptz not null default now()
);

create index demo_upload_usage_sandbox_id_idx on public.demo_upload_usage (sandbox_id);

alter table public.demo_upload_usage enable row level security;
revoke all on public.demo_upload_usage from anon, authenticated;

-- File rows ----------------------------------------------------------------

create or replace function private.enforce_demo_upload_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The limits live here and nowhere else (the app repeats them in
  -- src/lib/validation/file.ts to refuse a file before it uploads).
  c_max_files constant int := 5;
  c_max_bytes constant bigint := 2 * 1024 * 1024;
  c_allowed_types constant text[] := array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'
  ];

  v_sandbox_id uuid;
  v_object_size bigint;
  v_object_type text;
  v_uploaded int;
begin
  -- Only a member of the workspace is answered here. A trigger runs before
  -- row level security, so for anyone else (and for a caller with no user,
  -- like the clone) this steps aside and the policy gives its usual error;
  -- a limit message would tell an outsider how full a sandbox is.
  if private.member_role(new.workspace_id) is null then
    return new;
  end if;

  -- The clone inserts its file rows before it records the sandbox, so a row
  -- inserted by the clone finds no sandbox here and passes (the template has
  -- files over 2 MB and Office documents on purpose).
  select s.id into v_sandbox_id
  from public.demo_sandboxes s
  where new.workspace_id in (s.workspace_id, s.free_workspace_id);

  if v_sandbox_id is null then
    return new;
  end if;

  new.uploaded_in_demo := true;

  -- The path is what the object checks below look up, so it must lead into
  -- this row's own workspace and project; otherwise a row could borrow the
  -- object (and the size and type) of another file.
  if split_part(new.storage_path, '/', 1) <> new.workspace_id::text
     or split_part(new.storage_path, '/', 2) <> new.project_id::text then
    raise exception using
      message = 'demo_upload_path_invalid',
      errcode = 'CD005';
  end if;

  -- The row's size and type are whatever the browser sent. The object is
  -- what Storage received, so the checks read that. A row with no object,
  -- or an object without a size or a type, is refused.
  select
    case when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint end,
    o.metadata ->> 'mimetype'
  into v_object_size, v_object_type
  from storage.objects o
  where o.bucket_id = 'project-files'
    and o.name = new.storage_path;

  if not found or v_object_size is null or v_object_type is null then
    raise exception using
      message = 'demo_upload_object_missing',
      errcode = 'CD005';
  end if;

  if not (v_object_type = any (c_allowed_types)) then
    raise exception using
      message = 'demo_upload_type_limit',
      errcode = 'CD005';
  end if;

  if v_object_size > c_max_bytes then
    raise exception using
      message = 'demo_upload_size_limit',
      errcode = 'CD005';
  end if;

  -- Two uploads racing each other (two tabs, or the owner and a client)
  -- would both count 4 and both pass. The lock makes the count and the
  -- insert one step per sandbox.
  perform pg_advisory_xact_lock(hashtext('demo_upload:' || v_sandbox_id::text));

  -- Both workspaces of the sandbox share the 5, and the count is of the
  -- ledger, so it does not shrink when a file, project or client is deleted.
  select count(*) into v_uploaded
  from public.demo_upload_usage u
  where u.sandbox_id = v_sandbox_id;

  if v_uploaded >= c_max_files then
    raise exception using
      message = 'demo_upload_count_limit',
      errcode = 'CD005';
  end if;

  insert into public.demo_upload_usage (sandbox_id)
  values (v_sandbox_id);

  return new;
end;
$$;

create trigger enforce_demo_upload_limits
  before insert on public.project_files
  for each row execute function private.enforce_demo_upload_limits();

-- Storage objects ----------------------------------------------------------

-- True when an object may be added under this name: always outside a
-- sandbox; inside one, only under a canonical name that no file row already
-- uses, and while the workspace's prefix holds fewer objects than its
-- template copies plus 5. The template
-- copies are the workspace's file rows that were not uploaded in the demo (8
-- in the Pro workspace, none in the Free one). The cap is per workspace, so
-- a sandbox holds at most its copies plus 5 in each of its two workspaces.
--
-- Canonical means the name the app builds (src/lib/files/storage-path.ts):
-- {workspace_id}/{project_id}/{file_id}/{name}, exactly 4 segments, the first
-- three lower case UUIDs. Without that, a workspace id written in upper case
-- still resolves to the same workspace (storage_path_uuid reads either case)
-- but never matches the lower case prefix the count below looks for, so the
-- cap would not see the object. With canonical names only, the count can use
-- a plain prefix match on (bucket_id, name).
--
-- A name a project_files row already uses is refused: the owner of an object
-- may delete it, and without this they could put a different payload under
-- the name of a file that was registered (and checked) earlier.
--
-- The function is volatile on purpose. A stable function sees the snapshot of
-- the statement that called it, so a count taken after waiting for the lock
-- below would still miss the objects a concurrent upload committed meanwhile.
-- A volatile function takes a fresh snapshot per statement inside it. The
-- lock is per workspace and held to the end of the transaction, so direct
-- uploads to one workspace count and insert one at a time. Unlike the policy
-- it replaces, this one reads storage.objects, so it is a security definer
-- function that sees every object, not only the ones the caller may read.
create or replace function private.demo_storage_insert_allowed(p_object_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_extra_objects constant int := 5;
  c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  v_workspace_id uuid := private.storage_path_uuid(p_object_name, 1);
  v_template_copies int;
  v_objects int;
begin
  if v_workspace_id is null or not private.is_demo_workspace(v_workspace_id) then
    return true;
  end if;

  if p_object_name !~ ('^' || c_uuid || '/' || c_uuid || '/' || c_uuid || '/[^/]+$') then
    return false;
  end if;

  if exists (
    select 1
    from public.project_files f
    where f.workspace_id = v_workspace_id
      and f.storage_path = p_object_name
  ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('demo_storage:' || v_workspace_id::text));

  select count(*) into v_template_copies
  from public.project_files
  where workspace_id = v_workspace_id
    and not uploaded_in_demo;

  select count(*) into v_objects
  from storage.objects o
  where o.bucket_id = 'project-files'
    and o.name like v_workspace_id::text || '/%';

  return v_objects < v_template_copies + c_extra_objects;
end;
$$;

-- A policy runs as the querying role, so authenticated needs EXECUTE by
-- name, the same as for can_access_storage_object.
grant execute on function private.demo_storage_insert_allowed(text) to authenticated;

drop policy project_files_storage_insert on storage.objects;

create policy project_files_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and private.can_access_storage_object(name)
    and private.demo_storage_insert_allowed(name)
  );

-- Cleanup ---------------------------------------------------------------------

-- delete_expired_demo_sandboxes and finish_demo_sandbox_cleanup come from
-- 20260930100000_demo_sandboxes.sql; the bodies below are those with three
-- additions, and nothing else changed.
--
-- 1. The paths handed to the server for removal are every object under the
--    sandbox's workspace prefixes (canonical, so a plain prefix match), not only the ones a
--    file row names, so an upload that never got a row (or whose row was
--    deleted with a project) is removed with the sandbox.
-- 2. The AI ledger rows older than 48 hours are pruned. That is by age, not
--    by sandbox: the daily budget counts the last 24 hours across every
--    sandbox, expired or not, and the 24 hours extra is slack. The upload
--    ledger rows older than 48 hours go the same way, a backstop for rows
--    whose sandbox never reached finish_demo_sandbox_cleanup.
-- 3. finish_demo_sandbox_cleanup removes the sandbox's upload ledger rows.
--    (The AI ledger rows stay for the budget.)
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
        select array_agg(p.path order by p.path)
        from (
          select f.storage_path as path
          from public.project_files f
          where f.workspace_id in (select w from private.demo_sandbox_workspace_ids(s.id) w)
          union
          select o.name
          from storage.objects o
          where o.bucket_id = 'project-files'
            and exists (
              select 1
              from private.demo_sandbox_workspace_ids(s.id) w
              where o.name like w::text || '/%'
            )
        ) p
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

  delete from public.demo_ai_usage
  where created_at < now() - interval '48 hours';

  delete from public.demo_upload_usage
  where created_at < now() - interval '48 hours';

  return jsonb_build_object(
    'sandboxes', v_sandboxes,
    'orphan_user_ids', to_jsonb(v_orphans),
    'draft_requests_deleted', v_drafts
  );
end;
$$;

revoke execute on function public.delete_expired_demo_sandboxes() from public, anon, authenticated;
grant execute on function public.delete_expired_demo_sandboxes() to service_role;

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
    returning id
  ),
  usage as (
    delete from public.demo_upload_usage
    where sandbox_id in (select id from gone)
  )
  select count(*) into v_count from gone;

  return v_count;
end;
$$;

revoke execute on function public.finish_demo_sandbox_cleanup(uuid[]) from public, anon, authenticated;
grant execute on function public.finish_demo_sandbox_cleanup(uuid[]) to service_role;

-- What the pages read -------------------------------------------------------------

-- How many uploads the sandbox of p_workspace_id has used (both of its
-- workspaces share the count), for the hint under the uploader. The ledger
-- has no grant, so this is a security definer function; it answers only a
-- member of the workspace, and null for anyone else and for a workspace
-- outside a sandbox, so it never says whether a workspace is a sandbox or
-- how much it holds to someone outside it.
create or replace function public.demo_uploads_used(p_workspace_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sandbox_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if private.member_role(p_workspace_id) is null then
    return null;
  end if;

  select s.id into v_sandbox_id
  from public.demo_sandboxes s
  where p_workspace_id in (s.workspace_id, s.free_workspace_id);

  if v_sandbox_id is null then
    return null;
  end if;

  return (
    select count(*)::int
    from public.demo_upload_usage u
    where u.sandbox_id = v_sandbox_id
  );
end;
$$;

revoke execute on function public.demo_uploads_used(uuid) from public, anon;
grant execute on function public.demo_uploads_used(uuid) to authenticated;

-- Which half of a demo sandbox p_workspace_id is: 'pro' (the Pro workspace,
-- with the slug of its Free sibling for the link on the billing page) or
-- 'free'. No row outside a sandbox. Security invoker: demo_sandboxes and
-- workspaces are read under the caller's own row level security, so a user
-- who is not in the sandbox gets nothing.
create or replace function public.get_sandbox_billing(p_workspace_id uuid)
returns table (kind text, free_slug text)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case when s.workspace_id = p_workspace_id then 'pro' else 'free' end,
    case
      when s.workspace_id = p_workspace_id then (
        select w.slug from public.workspaces w where w.id = s.free_workspace_id
      )
    end
  from public.demo_sandboxes s
  where s.workspace_id = p_workspace_id
     or s.free_workspace_id = p_workspace_id
  limit 1;
$$;

revoke execute on function public.get_sandbox_billing(uuid) from public, anon;
grant execute on function public.get_sandbox_billing(uuid) to authenticated;
