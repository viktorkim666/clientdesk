-- Milestone 3: billing. Plan state lives in Postgres and is kept in sync by
-- the app reading Stripe's current subscription, never by trusting webhook
-- event order (see the plan's "Source of truth" decision). Same style as the
-- init migration: `private.*` helpers are `security definer` with
-- `search_path = ''`, and policies only ever call them.

-- Tables ---------------------------------------------------------------

create table public.workspace_billing (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  subscription_status text,
  price_id text,
  current_period_end timestamptz,
  cancel_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Row level security -----------------------------------------------------

alter table public.workspace_billing enable row level security;

-- workspace_billing: owner and member read their workspace's row; a client
-- and a non-member read nothing. Every write goes through the admin client
-- with the Supabase secret key (the webhook, the sync function and the
-- owner-only checkout action), never through `authenticated`, so there are
-- no insert, update or delete policies.
create policy workspace_billing_select on public.workspace_billing
  for select to authenticated
  using (private.member_role(workspace_id) in ('owner', 'member'));

-- updated_at maintenance -------------------------------------------------
-- Every write to workspace_billing already sets updated_at by hand (see
-- sync.ts), but a trigger makes that dependable instead of relying on every
-- caller to remember it, the same small-definer-function shape as
-- protect_last_owner below. clock_timestamp(), not now(): now() is frozen
-- to the start of the surrounding transaction, which would make a
-- row updated later in the same transaction as its insert look unchanged.

create or replace function private.touch_workspace_billing_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger workspace_billing_set_updated_at
  before update on public.workspace_billing
  for each row execute function private.touch_workspace_billing_updated_at();

-- Plan rule ----------------------------------------------------------------
-- A workspace is Pro while its subscription is active, trialing, or past_due
-- (Stripe is still retrying payment). No row, a null status, or any other
-- status is Free. `security definer` + `search_path = ''` so this can be
-- called from the client limit trigger below without exposing `private` to
-- `authenticated`.

create or replace function private.workspace_plan(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when subscription_status in ('active', 'trialing', 'past_due') then 'pro'
        else 'free'
      end
      from public.workspace_billing
      where workspace_id = p_workspace_id
    ),
    'free'
  );
$$;

-- Client limit ---------------------------------------------------------
-- Free workspaces may have at most `v_limit` clients. Downgrading keeps
-- existing clients over the limit; only the next insert is refused.

create or replace function private.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit constant int := 2;
  v_existing_clients int;
begin
  -- Locks the workspace row first so two concurrent inserts on the same
  -- workspace count and check the limit one at a time, not both against the
  -- same stale count.
  perform 1 from public.workspaces where id = new.workspace_id for update;

  if private.workspace_plan(new.workspace_id) = 'pro' then
    return new;
  end if;

  select count(*) into v_existing_clients
  from public.clients
  where workspace_id = new.workspace_id;

  if v_existing_clients >= v_limit then
    -- A named, stable error: SQLSTATE 'CD001' is a custom code outside the
    -- ranges Postgres and plpgsql reserve for their own errors (plpgsql's
    -- RAISE without ERRCODE uses P0001), so the server action can match on
    -- `error.code` alone, without parsing `plan_limit_clients` out of the
    -- message.
    raise exception using
      message = 'plan_limit_clients',
      errcode = 'CD001';
  end if;

  return new;
end;
$$;

create trigger enforce_client_limit_trigger
  before insert on public.clients
  for each row execute function private.enforce_client_limit();
