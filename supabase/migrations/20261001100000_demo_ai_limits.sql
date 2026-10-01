-- Milestone 5: AI limits inside a demo sandbox. A sandbox gets 3 AI drafts in
-- total, and all sandboxes together get a daily budget, so a visitor (or a
-- bot) cannot run up the Anthropic bill. Past either limit claim_ai_draft
-- raises CD004 (message ai_demo_limit for the sandbox's own 3, ai_demo_budget
-- for the daily budget, so the app can say which one the visitor hit); the
-- route turns that into a 429 and the app shows a saved sample draft instead.
--
-- Both limits count a ledger, demo_ai_usage, not ai_draft_requests. A visitor
-- owns their sandbox and can delete a project or a client, which cascades to
-- ai_draft_requests; counting that table would let them delete their way back
-- to zero. The ledger has no foreign key to a project, client, workspace or
-- sandbox, is written only by claim_ai_draft (security definer) and is not
-- granted to any API role. The per-sandbox limit counts its rows by
-- sandbox_id. The daily budget counts the rows of the last 24 hours, so it
-- also survives the sandboxes that spent it expiring. Pruning is by age and
-- lives in delete_expired_demo_sandboxes (20261001110000_demo_upload_limits.sql).
--
-- The body below is claim_ai_draft from 20260927143617_ai_drafts.sql with the
-- demo block added just before the insert. Every existing check, error code
-- and grant is unchanged, so a workspace outside a sandbox behaves as before.

create table public.demo_ai_usage (
  id uuid primary key default gen_random_uuid(),
  -- demo_sandboxes.id, deliberately not a foreign key: the row must outlive
  -- the sandbox it counts.
  sandbox_id uuid not null,
  created_at timestamptz not null default now()
);

-- The per-sandbox count and the daily budget count (a range on created_at).
create index demo_ai_usage_sandbox_id_idx on public.demo_ai_usage (sandbox_id);
create index demo_ai_usage_created_at_idx on public.demo_ai_usage (created_at);

alter table public.demo_ai_usage enable row level security;
revoke all on public.demo_ai_usage from anon, authenticated;

create or replace function public.claim_ai_draft(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The two demo limits live here and nowhere else. A sandbox lives 24
  -- hours, so "per sandbox" needs no time window. The budget is the
  -- number of demo drafts allowed across all sandboxes in any rolling 24
  -- hours; change it here (and in the pgTAP file) to raise it.
  c_demo_sandbox_limit constant int := 3;
  c_demo_daily_budget constant int := 150;

  v_workspace_id uuid;
  v_user_id uuid;
  v_user_count int;
  v_workspace_count int;
  v_demo_sandbox_id uuid;
  v_demo_sandbox_count int;
  v_demo_global_count int;
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
  -- queue here. The demo budget lock below is a second advisory lock, always
  -- taken after this one, so the order is the same for every caller.
  perform pg_advisory_xact_lock(hashtext('claim_ai_draft:' || v_user_id::text));

  select s.id into v_demo_sandbox_id
  from public.demo_sandboxes s
  where v_workspace_id in (s.workspace_id, s.free_workspace_id);

  -- Every demo claim, from any sandbox, queues here before it counts
  -- anything. The sandbox count below is then exact for the one claim
  -- running (two tabs of the same sandbox cannot both see 2 and pass), and
  -- so is the daily budget. Taken right after the user lock, before any
  -- count, so all callers lock in the same order.
  if v_demo_sandbox_id is not null then
    perform pg_advisory_xact_lock(hashtext('claim_ai_draft:demo_budget'));
  end if;

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

  if v_demo_sandbox_id is not null then
    -- Both workspaces of a sandbox share its drafts, and they count however
    -- old they are (the sandbox is deleted after 24 hours). The ledger is
    -- read by sandbox_id, so deleting a project or a client frees nothing.
    select count(*) into v_demo_sandbox_count
    from public.demo_ai_usage u
    where u.sandbox_id = v_demo_sandbox_id;

    if v_demo_sandbox_count >= c_demo_sandbox_limit then
      raise exception using
        message = 'ai_demo_limit',
        errcode = 'CD004';
    end if;

    select count(*) into v_demo_global_count
    from public.demo_ai_usage u
    where u.created_at > now() - interval '24 hours';

    if v_demo_global_count >= c_demo_daily_budget then
      raise exception using
        message = 'ai_demo_budget',
        errcode = 'CD004';
    end if;

    insert into public.demo_ai_usage (sandbox_id)
    values (v_demo_sandbox_id);
  end if;

  insert into public.ai_draft_requests (workspace_id, user_id, project_id)
  values (v_workspace_id, v_user_id, p_project_id)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- create or replace keeps the existing grants; restated so this file is
-- correct on its own.
revoke execute on function public.claim_ai_draft(uuid) from public, anon;
grant execute on function public.claim_ai_draft(uuid) to authenticated;
