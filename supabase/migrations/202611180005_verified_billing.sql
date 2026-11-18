begin;
create table if not exists public.billing_subscription_checkouts (
  actor uuid primary key references auth.users(id), id uuid not null default gen_random_uuid(), payload jsonb not null, created_at timestamptz not null default now()
);
alter table public.billing_subscription_checkouts enable row level security;
revoke all on public.billing_subscription_checkouts from anon,authenticated;
grant all on public.billing_subscription_checkouts to service_role;
create or replace function public.billing_reserve_checkout(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.billing_subscription_checkouts%rowtype;
begin
  insert into public.billing_subscription_checkouts(actor,payload) values(p_actor,p_data) on conflict(actor) do nothing;
  select * into r from public.billing_subscription_checkouts where actor=p_actor;
  if r.payload->>'planId' is distinct from p_data->>'planId' then raise exception 'BILLING_CHECKOUT_PENDING'; end if;
  return jsonb_build_object('id',r.id,'payload',r.payload,'createdAt',r.created_at);
end $$;
revoke all on function public.billing_reserve_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.billing_reserve_checkout(uuid,jsonb) to service_role;
-- Payment fulfillment is server-only and replay-safe. No existing balances are changed.
create table if not exists public.billing_receipts (
  id text primary key, actor uuid not null references auth.users(id), "userId" text not null,
  "packageId" text not null, tokens integer not null check(tokens>0), "createdAt" timestamptz not null default now()
);
alter table public.billing_receipts enable row level security;
revoke all on public.billing_receipts from anon,authenticated;
grant all on public.billing_receipts to service_role;

create or replace function public.billing_credit_tokens(p_actor uuid,p_receipt text,p_package text,p_tokens integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; profile_balance numeric; prior public.billing_receipts%rowtype;
begin
  if p_tokens is null or p_tokens<1 or p_tokens>100000000 or length(p_receipt) not between 3 and 200 or coalesce(p_package,'')='' then raise exception 'BILLING_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tokens:'||owner_id,0));
  select * into prior from public.billing_receipts where id=p_receipt;
  if found then
    if prior.actor<>p_actor or prior."packageId"<>p_package or prior.tokens<>p_tokens then raise exception 'BILLING_RECEIPT_MISMATCH'; end if;
    return jsonb_build_object('credited',false,'tokens',p_tokens);
  end if;
  select tokens into balance from public.user_tokens where id=owner_id for update;
  select case when trim(both '"' from tokens::text) ~ '^[0-9]+(\.[0-9]+)?$' then trim(both '"' from tokens::text)::numeric else null end
    into profile_balance from public.users where auth_user_id=p_actor or uid=owner_id order by (auth_user_id=p_actor) desc nulls last,id limit 1 for update;
  -- Existing consumers use both stores. Conflicting balances need reconciliation,
  -- never overwrite either one or acknowledge an uncredited payment.
  if balance is not null and profile_balance is not null and balance<>profile_balance then raise exception 'BILLING_BALANCE_CONFLICT'; end if;
  balance:=coalesce(balance,profile_balance);
  balance:=coalesce(balance,0)+p_tokens;
  insert into public.billing_receipts(id,actor,"userId","packageId",tokens) values(p_receipt,p_actor,owner_id,p_package,p_tokens);
  insert into public.user_tokens(id,tokens,"createdAt","updatedAt") values(owner_id,balance,to_jsonb(now()::text),to_jsonb(now()::text))
    on conflict(id) do update set tokens=excluded.tokens,"updatedAt"=excluded."updatedAt";
  update public.users set tokens=to_jsonb(balance) where auth_user_id=p_actor or (uid=owner_id and auth_user_id is null);
  insert into public.token_purchases(id,"userId","packageId","tokenAmount",status,"createdAt") values(p_receipt,owner_id,p_package,p_tokens,'completed',now()::text);
  return jsonb_build_object('credited',true,'tokens',p_tokens,'balance',balance);
end $$;
revoke all on function public.billing_credit_tokens(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.billing_credit_tokens(uuid,text,text,integer) to service_role;

create or replace function public.billing_save_subscription(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); row_id text; r public.subscriptions%rowtype; previous public.subscriptions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('subscription:'||owner_id,0));
  if (select count(*) from public.subscriptions where "userId"=owner_id)>1 then raise exception 'BILLING_MULTIPLE_SUBSCRIPTIONS'; end if;
  select * into previous from public.subscriptions where "userId"=owner_id for update;
  row_id:=previous.id;
  r:=jsonb_populate_record(null::public.subscriptions,p_data);
  if r."planId" is null or r.status is null then raise exception 'BILLING_INVALID'; end if;
  if previous."stripeSubscriptionId" is not null and previous."stripeSubscriptionId" is distinct from r."stripeSubscriptionId" and previous.status not in ('canceled','incomplete_expired') then raise exception 'BILLING_SUBSCRIPTION_CONFLICT'; end if;
  if row_id is null then
    row_id:=gen_random_uuid()::text;
    insert into public.subscriptions(id,"userId","planId",status,"createdAt") values(row_id,owner_id,r."planId",r.status,now()::text);
  end if;
  update public.subscriptions set "planId"=r."planId",status=r.status,"stripeSubscriptionId"=r."stripeSubscriptionId",
    "stripeCustomerId"=r."stripeCustomerId","paymentMethod"=r."paymentMethod","couponUsed"=r."couponUsed",
    "originalPrice"=r."originalPrice","finalPrice"=r."finalPrice","discountAmount"=r."discountAmount",
    "billingDetails"=coalesce(r."billingDetails",previous."billingDetails"),"updatedAt"=now()::text where id=row_id;
  if r.status in ('active','trialing','canceled','incomplete_expired') then delete from public.billing_subscription_checkouts where actor=p_actor; end if;
  return jsonb_build_object('id',row_id);
end $$;
revoke all on function public.billing_save_subscription(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.billing_save_subscription(uuid,jsonb) to service_role;

-- A valid login must not be able to assign a paid plan or credit its own balance.
drop policy if exists billing_subscriptions_read on public.subscriptions;
create policy billing_subscriptions_read on public.subscriptions for select to authenticated using("userId"=(select public.inventory_current_owner()));
drop policy if exists billing_subscriptions_insert on public.subscriptions;
create policy billing_subscriptions_insert on public.subscriptions as restrictive for insert to anon,authenticated with check(false);
drop policy if exists billing_subscriptions_update on public.subscriptions;
create policy billing_subscriptions_update on public.subscriptions as restrictive for update to anon,authenticated using(false) with check(false);
drop policy if exists billing_subscriptions_delete on public.subscriptions;
create policy billing_subscriptions_delete on public.subscriptions as restrictive for delete to anon,authenticated using(false);
drop policy if exists token_purchases_all on public.token_purchases;
drop policy if exists billing_purchases_read on public.token_purchases;
create policy billing_purchases_read on public.token_purchases for select to authenticated using("userId"=(select public.inventory_current_owner()));
drop policy if exists billing_tokens_read on public.user_tokens;
create policy billing_tokens_read on public.user_tokens for select to authenticated using(id=(select public.inventory_current_owner()));

create or replace function public.app_protect_profile_identity() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated') and (
    new.id is distinct from old.id or new.uid is distinct from old.uid or new.auth_user_id is distinct from old.auth_user_id or new.tokens is distinct from old.tokens
  ) then raise exception 'APP_PROTECTED_PROFILE_FIELDS'; end if;
  return new;
end $$;
revoke all on function public.app_protect_profile_identity() from public;
drop trigger if exists app_protect_profile_identity on public.users;
create trigger app_protect_profile_identity before update on public.users for each row execute function public.app_protect_profile_identity();
create or replace function public.billing_actor_for_subscription(p_subscription text) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select a.id from auth.users a join public.subscriptions s on s."userId"=public.copilot_owner(a.id)
    where s."stripeSubscriptionId"=p_subscription order by a.id limit 1
$$;
revoke all on function public.billing_actor_for_subscription(text) from public,anon,authenticated;
grant execute on function public.billing_actor_for_subscription(text) to service_role;
-- One balance reader for the web, app and processing API.
create or replace function public.billing_token_balance(p_actor uuid) returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; profile_balance numeric;
begin
 if auth.uid() is not null and auth.uid()<>p_actor and current_setting('role',true)<>'service_role' then raise exception 'BILLING_FORBIDDEN'; end if;
 select tokens into balance from public.user_tokens where id=owner_id;
 select case when trim(both '"' from tokens::text) ~ '^[0-9]+(\.[0-9]+)?$' then trim(both '"' from tokens::text)::numeric else null end
 into profile_balance from public.users where auth_user_id=p_actor or uid=owner_id order by (auth_user_id=p_actor) desc nulls last,id limit 1;
 if balance is not null and profile_balance is not null and balance<>profile_balance then raise exception 'BILLING_BALANCE_CONFLICT'; end if;
 return coalesce(balance,profile_balance,0);
end $$;
revoke all on function public.billing_token_balance(uuid) from public,anon,authenticated;
grant execute on function public.billing_token_balance(uuid) to service_role;
create or replace function public.app_token_balance() returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'APP_UNAUTHORIZED'; end if;
 return public.billing_token_balance(auth.uid());
end $$;
revoke all on function public.app_token_balance() from public,anon;
grant execute on function public.app_token_balance() to authenticated;
create table if not exists public.billing_token_usage (
 id text primary key, actor uuid not null references auth.users(id), tokens integer not null check(tokens>=0), balance numeric not null, created_at timestamptz not null default now()
);
alter table public.billing_token_usage enable row level security;
revoke all on public.billing_token_usage from anon,authenticated;
grant all on public.billing_token_usage to service_role;
create or replace function public.billing_debit_tokens(p_actor uuid,p_receipt text,p_tokens integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; prior public.billing_token_usage%rowtype;
begin
 if p_actor is null or p_receipt is null or length(p_receipt) not between 3 and 200 or p_tokens is null or p_tokens<0 then raise exception 'BILLING_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tokens:'||owner_id,0));
 select * into prior from public.billing_token_usage where id=p_receipt;
 if found then
  if prior.actor<>p_actor or prior.tokens<>p_tokens then raise exception 'BILLING_RECEIPT_MISMATCH'; end if;
  return jsonb_build_object('debited',false,'balance',prior.balance);
 end if;
 -- Lock both existing stores in the same order as credits before reading.
 perform 1 from public.user_tokens where id=owner_id for update;
 perform 1 from public.users where auth_user_id=p_actor or uid=owner_id order by id for update;
 balance:=public.billing_token_balance(p_actor);
 if balance<p_tokens then raise exception 'BILLING_INSUFFICIENT_TOKENS'; end if;
 balance:=balance-p_tokens;
 insert into public.user_tokens(id,tokens,"createdAt","updatedAt") values(owner_id,balance,to_jsonb(now()::text),to_jsonb(now()::text))
 on conflict(id) do update set tokens=excluded.tokens,"updatedAt"=excluded."updatedAt";
 update public.users set tokens=to_jsonb(balance) where auth_user_id=p_actor or (uid=owner_id and auth_user_id is null);
 insert into public.billing_token_usage(id,actor,tokens,balance) values(p_receipt,p_actor,p_tokens,balance);
 return jsonb_build_object('debited',true,'balance',balance);
end $$;
revoke all on function public.billing_debit_tokens(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.billing_debit_tokens(uuid,text,integer) to service_role;
commit;
