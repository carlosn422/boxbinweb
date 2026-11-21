begin;

-- Per-user verified Copilot plan limits and billing cycle synced by Edge Functions from Stripe.
create table if not exists public.copilot_entitlements (
  actor uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'starter',
  plan_name text not null default 'Starter',
  max_chats integer not null default 10 check (max_chats between 1 and 200),
  max_messages_per_chat integer not null default 20 check (max_messages_per_chat between 2 and 50),
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.copilot_entitlements enable row level security;
revoke all on public.copilot_entitlements from anon, authenticated;
grant all on public.copilot_entitlements to service_role;

create or replace function public.copilot_sync_entitlements(
  p_actor uuid,
  p_tier text,
  p_plan_name text,
  p_max_chats integer,
  p_max_messages_per_chat integer,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_actor is null
     or coalesce(trim(p_tier), '') = ''
     or p_max_chats is null or p_max_chats not between 1 and 200
     or p_max_messages_per_chat is null or p_max_messages_per_chat not between 2 and 50 then
    raise exception 'COPILOT_INVALID';
  end if;
  insert into public.copilot_entitlements(actor, tier, plan_name, max_chats, max_messages_per_chat, period_start, period_end, updated_at)
  values (
    p_actor,
    trim(p_tier),
    left(coalesce(nullif(trim(p_plan_name), ''), trim(p_tier)), 120),
    p_max_chats,
    p_max_messages_per_chat,
    p_period_start,
    p_period_end,
    now()
  )
  on conflict (actor) do update set
    tier = excluded.tier,
    plan_name = excluded.plan_name,
    max_chats = excluded.max_chats,
    max_messages_per_chat = excluded.max_messages_per_chat,
    period_start = coalesce(excluded.period_start, copilot_entitlements.period_start),
    period_end = coalesce(excluded.period_end, copilot_entitlements.period_end),
    updated_at = excluded.updated_at;
end $$;

-- Allow threads up to 50 messages (+1 welcome message) while enforcing each user's plan limits below.
alter table public.copilot_chats drop constraint if exists copilot_chat_messages;
alter table public.copilot_chats add constraint copilot_chat_messages
  check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 51 and octet_length(messages::text) <= 1000000);

create or replace function public.copilot_chat_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_max_chats integer := 10;
  v_max_messages integer := 20;
  v_effective_max_messages integer := 20;
begin
  if TG_OP = 'UPDATE' and new."userId" <> old."userId" then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('copilot-chat:' || new."userId"::text, 0));
  select max_chats, max_messages_per_chat into v_max_chats, v_max_messages
    from public.copilot_entitlements where actor = new."userId";
  v_max_chats := coalesce(v_max_chats, 10);
  v_max_messages := coalesce(v_max_messages, 20);
  if TG_OP = 'INSERT' and not exists (select 1 from public.copilot_chats where id = new.id)
     and (select count(*) from public.copilot_chats where "userId" = new."userId") >= v_max_chats then
    raise exception 'COPILOT_CHAT_LIMIT';
  end if;
  v_effective_max_messages := v_max_messages;
  if jsonb_array_length(new.messages) > v_max_messages + 1 then
    -- Token holders can extend existing chats up to 50 messages even while current-cycle deletion is locked.
    if public.billing_token_balance(new."userId") >= 50 then
      v_effective_max_messages := 50;
    end if;
  end if;
  if jsonb_array_length(new.messages) > v_effective_max_messages + 1 then
    if TG_OP = 'INSERT' or jsonb_array_length(new.messages) > jsonb_array_length(old.messages) then
      raise exception 'COPILOT_MESSAGE_LIMIT';
    end if;
  end if;
  new."messageCount" := jsonb_array_length(new.messages);
  new."updatedAt" := now();
  return new;
end $$;

-- Chats created during the active subscription billing cycle cannot be deleted
-- until the subscription renews (period_start advances to the new cycle).
create or replace function public.copilot_chat_delete_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_period_start timestamptz;
begin
  select period_start into v_period_start from public.copilot_entitlements where actor = old."userId";
  if v_period_start is not null and old."createdAt" >= v_period_start then
    raise exception 'COPILOT_DELETE_LOCKED';
  end if;
  return old;
end $$;
drop trigger if exists copilot_chat_delete_guard on public.copilot_chats;
create trigger copilot_chat_delete_guard before delete on public.copilot_chats for each row execute function public.copilot_chat_delete_guard();

-- Per-cycle included usage counters (keyed by subscription cycle start date, or UTC month start).
create table if not exists public.copilot_monthly_usage (
  actor uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat', 'upload', 'image', 'voice_seconds')),
  month date not null,
  used integer not null default 0 check (used >= 0),
  primary key (actor, kind, month)
);
alter table public.copilot_monthly_usage enable row level security;
revoke all on public.copilot_monthly_usage from anon, authenticated;
grant all on public.copilot_monthly_usage to service_role;

create or replace function public.copilot_usage_cycle(p_actor uuid) returns date
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_period_start timestamptz;
begin
  select period_start into v_period_start from public.copilot_entitlements where actor = p_actor;
  if v_period_start is not null then
    return (v_period_start at time zone 'UTC')::date;
  end if;
  return date_trunc('month', now() at time zone 'UTC')::date;
end $$;

create or replace function public.copilot_usage_summary(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cycle date := public.copilot_usage_cycle(p_actor);
  v_chat integer := 0;
  v_upload integer := 0;
  v_image integer := 0;
  v_voice integer := 0;
  v_balance numeric := 0;
begin
  if p_actor is null then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  select
    coalesce(sum(used) filter (where kind = 'chat'), 0),
    coalesce(sum(used) filter (where kind = 'upload'), 0),
    coalesce(sum(used) filter (where kind = 'image'), 0),
    coalesce(sum(used) filter (where kind = 'voice_seconds'), 0)
  into v_chat, v_upload, v_image, v_voice
  from public.copilot_monthly_usage
  where actor = p_actor and month = v_cycle;

  v_balance := public.billing_token_balance(p_actor);

  return jsonb_build_object(
    'month', to_char(v_cycle, 'YYYY-MM-DD'),
    'chat', v_chat,
    'upload', v_upload,
    'image', v_image,
    'voiceSeconds', v_voice,
    'tokenBalance', v_balance
  );
end $$;

-- Atomically consume subscription cycle allowance first; if exhausted, debit AI tokens.
create or replace function public.copilot_consume_allowance(
  p_actor uuid,
  p_kind text,
  p_amount integer,
  p_monthly_limit integer,
  p_token_cost integer,
  p_receipt text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cycle date := public.copilot_usage_cycle(p_actor);
  v_used integer := 0;
  v_debit jsonb;
  v_balance numeric := 0;
begin
  if p_actor is null
     or p_kind not in ('chat', 'upload', 'image', 'voice_seconds')
     or p_amount is null or p_amount < 1 or p_amount > 3600
     or p_monthly_limit is null or p_monthly_limit < 0
     or p_token_cost is null or p_token_cost < 0
     or p_receipt is null or length(p_receipt) not between 3 and 200 then
    raise exception 'COPILOT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('copilot-allowance:' || p_actor::text, 0));

  select coalesce(used, 0) into v_used
  from public.copilot_monthly_usage
  where actor = p_actor and kind = p_kind and month = v_cycle
  for update;

  if coalesce(v_used, 0) + p_amount <= p_monthly_limit then
    insert into public.copilot_monthly_usage(actor, kind, month, used)
    values (p_actor, p_kind, v_cycle, p_amount)
    on conflict (actor, kind, month) do update set used = copilot_monthly_usage.used + excluded.used
    returning used into v_used;

    v_balance := public.billing_token_balance(p_actor);
    return jsonb_build_object(
      'source', 'plan',
      'kind', p_kind,
      'used', v_used,
      'limit', p_monthly_limit,
      'remaining', greatest(0, p_monthly_limit - v_used),
      'tokensSpent', 0,
      'tokenBalance', v_balance
    );
  end if;

  if p_token_cost <= 0 then
    raise exception 'COPILOT_QUOTA';
  end if;

  begin
    v_debit := public.billing_debit_tokens(p_actor, p_receipt, p_token_cost);
  exception when others then
    if sqlerrm like '%BILLING_INSUFFICIENT_TOKENS%' then
      raise exception 'COPILOT_INSUFFICIENT_TOKENS';
    end if;
    raise;
  end;

  v_balance := coalesce((v_debit->>'balance')::numeric, 0);
  return jsonb_build_object(
    'source', 'tokens',
    'kind', p_kind,
    'used', coalesce(v_used, 0),
    'limit', p_monthly_limit,
    'remaining', greatest(0, p_monthly_limit - coalesce(v_used, 0)),
    'tokensSpent', case when coalesce((v_debit->>'debited')::boolean, false) then p_token_cost else 0 end,
    'tokenBalance', v_balance
  );
end $$;

-- Plan-aware + token-fallback image claim with request idempotency.
create or replace function public.copilot_claim_image_v2(
  p_actor uuid,
  p_request_id text,
  p_hash text,
  p_monthly_limit integer,
  p_token_cost integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.copilot_images%rowtype;
  v_billing jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('copilot-image:' || p_actor::text, 0));
  select * into row from public.copilot_images where actor = p_actor and request_id = p_request_id for update;
  if found then
    if row.request_hash <> p_hash then raise exception 'COPILOT_REQUEST_CHANGED'; end if;
    if row.result is not null then return jsonb_build_object('result', row.result); end if;
    if row.busy_until > now() then raise exception 'COPILOT_BUSY'; end if;
  end if;
  if exists(select 1 from public.copilot_images where actor = p_actor and result is null and busy_until > now()) then
    raise exception 'COPILOT_BUSY';
  end if;

  v_billing := public.copilot_consume_allowance(
    p_actor,
    'image',
    1,
    p_monthly_limit,
    p_token_cost,
    'copilot:image:' || p_request_id
  );

  insert into public.copilot_images(actor, request_id, request_hash, busy_until)
  values (p_actor, p_request_id, p_hash, now() + interval '3 minutes')
  on conflict (actor, request_id) do update
    set lease = gen_random_uuid(), busy_until = excluded.busy_until
  returning * into row;

  return jsonb_build_object('lease', row.lease, 'billing', v_billing);
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace = 'public'::regnamespace and proname like 'copilot_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

commit;
