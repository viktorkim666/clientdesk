-- Milestone 4: AI update draft. This migration only adds the table the app
-- counts requests from and the gate that decides whether a caller may spend
-- an Anthropic call; the streaming call itself lives in application code
-- (milestone 4's later tasks), never here.

-- Tables ---------------------------------------------------------------

-- One row per successful claim, kept even if the Claude call that follows
-- fails, so a caller can't retry their way around the limit for free (see
-- the plan's "Rate limit and demo spend" decision).
create table public.ai_draft_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

-- Backs the per-user (last hour) and per-workspace (last 24 hours) counts
-- that claim_ai_draft below runs on every call.
create index ai_draft_requests_user_id_created_at_idx on public.ai_draft_requests (user_id, created_at desc);
create index ai_draft_requests_workspace_id_created_at_idx on public.ai_draft_requests (workspace_id, created_at desc);
-- Mirrors the project_id index every sibling activity table
-- (project_updates, update_comments, project_files) carries, so deleting a
-- project doesn't do a sequential scan here to find its rows to cascade.
create index ai_draft_requests_project_id_idx on public.ai_draft_requests (project_id);

-- These rows exist only to feed claim_ai_draft's rate-limit counts above;
-- nothing here reads them back for billing or reporting. Milestone 4 does
-- not add retention/cleanup for them - that's deferred to milestone 5
-- (demo spend work), which is when this table's growth first becomes worth
-- managing.

-- Row level security -----------------------------------------------------

alter table public.ai_draft_requests enable row level security;

-- A caller reads only their own claims, for a future "you've used N of 10
-- this hour" hint in the UI. There are no insert, update or delete
-- policies: every row is written by claim_ai_draft below, running as its
-- security definer, never by `authenticated` directly.
create policy ai_draft_requests_select on public.ai_draft_requests
  for select to authenticated
  using (user_id = auth.uid());

-- RPCs -----------------------------------------------------------------

-- Claims one AI draft request for the given project: checks the caller is
-- staff of its workspace, checks the workspace is on the Pro plan, checks
-- both rate limits, then inserts and returns the new row's id. Everything
-- happens in the calling transaction, so a caller either gets a row and a
-- green light to spend an Anthropic call, or gets nothing and an exception.
create or replace function public.claim_ai_draft(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_user_id uuid;
  v_user_count int;
  v_workspace_count int;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  v_user_id := auth.uid();

  select workspace_id into v_workspace_id
  from public.projects
  where id = p_project_id;

  -- An unknown project and a project the caller isn't staff of are refused
  -- with the same message, the same way project_update_recipients does, so
  -- the RPC never confirms whether a given project id exists.
  if v_workspace_id is null then
    raise exception 'only staff can request an AI draft';
  end if;

  -- Locks the workspace row first so two concurrent claims on the same
  -- workspace count and check its limit one at a time, the same guard
  -- enforce_client_limit uses for the client limit.
  perform 1 from public.workspaces where id = v_workspace_id for update;

  if private.is_staff(v_workspace_id) is not true then
    raise exception 'only staff can request an AI draft';
  end if;

  if private.workspace_plan(v_workspace_id) <> 'pro' then
    raise exception using
      message = 'ai_plan_required',
      errcode = 'CD002';
  end if;

  -- A row lock on the workspace only serializes claims within that one
  -- workspace; staff on two Pro workspaces could otherwise run this
  -- function for both at once and have each transaction count the other's
  -- not-yet-committed row as zero, letting them past the per-user cap
  -- below. A transaction-scoped advisory lock keyed on the user closes
  -- that gap: concurrent claims by the same user, on any workspace, now
  -- queue here. Nothing else in this schema takes an advisory lock, so
  -- there's no other lock order to stay consistent with.
  perform pg_advisory_xact_lock(hashtext('claim_ai_draft:' || v_user_id::text));

  select count(*) into v_user_count
  from public.ai_draft_requests
  where user_id = v_user_id
    and created_at > now() - interval '1 hour';

  if v_user_count >= 10 then
    raise exception using
      message = 'ai_rate_limited',
      errcode = 'CD003';
  end if;

  select count(*) into v_workspace_count
  from public.ai_draft_requests
  where workspace_id = v_workspace_id
    and created_at > now() - interval '24 hours';

  if v_workspace_count >= 50 then
    raise exception using
      message = 'ai_rate_limited',
      errcode = 'CD003';
  end if;

  insert into public.ai_draft_requests (workspace_id, user_id, project_id)
  values (v_workspace_id, v_user_id, p_project_id)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.claim_ai_draft(uuid) from public;
grant execute on function public.claim_ai_draft(uuid) to authenticated;
