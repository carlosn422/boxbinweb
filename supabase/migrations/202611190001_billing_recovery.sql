begin;

-- Serialize checkout recovery across tabs and requests. Separate from the
-- reservation so rotating a checkout cannot release an in-flight request.
create table public.billing_checkout_locks (
  owner_id text primary key,
  lease uuid not null,
  expires_at timestamptz not null
);
alter table public.billing_checkout_locks enable row level security;
revoke all on public.billing_checkout_locks from public, anon, authenticated;
grant all on public.billing_checkout_locks to service_role;

create function public.billing_checkout_lock(p_actor uuid, p_lease uuid, p_release boolean default false) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner_id text := public.copilot_owner(p_actor); acquired boolean;
begin
  if p_release then
    delete from public.billing_checkout_locks l where l.owner_id=v_owner_id and l.lease=p_lease;
    return true;
  end if;
  insert into public.billing_checkout_locks as l values(v_owner_id,p_lease,now()+interval '10 minutes')
    on conflict (owner_id) do update set lease=excluded.lease,expires_at=excluded.expires_at
    where l.expires_at<now()
    returning true into acquired;
  return coalesce(acquired,false);
end $$;
revoke all on function public.billing_checkout_lock(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_checkout_lock(uuid,uuid,boolean) to service_role;

-- Keep the original request intact until the server has reconciled it with
-- Stripe. Never silently replace an uncertain request with a fresh charge.
create or replace function public.billing_reserve_checkout(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.billing_subscription_checkouts%rowtype;
begin
  insert into public.billing_subscription_checkouts(actor,payload) values(p_actor,p_data) on conflict(actor) do nothing;
  select * into r from public.billing_subscription_checkouts where actor=p_actor;
  return jsonb_build_object('id',r.id,'payload',r.payload,'createdAt',r.created_at);
end $$;

create function public.billing_replace_checkout(p_actor uuid,p_previous uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.billing_subscription_checkouts where actor=p_actor and id=p_previous;
  return public.billing_reserve_checkout(p_actor,p_data);
end $$;
revoke all on function public.billing_replace_checkout(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.billing_replace_checkout(uuid,uuid,jsonb) to service_role;
create or replace function public.billing_save_subscription(p_actor uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); row_id text; r public.subscriptions%rowtype; previous public.subscriptions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('subscription:'||owner_id,0));
  if (select count(*) from public.subscriptions where "userId"=owner_id)>1 then raise exception 'BILLING_MULTIPLE_SUBSCRIPTIONS'; end if;
  select * into previous from public.subscriptions where "userId"=owner_id for update;
  if p_data ? 'expectedPreviousSubscriptionId' and previous."stripeSubscriptionId" is distinct from p_data->>'expectedPreviousSubscriptionId' then raise exception 'BILLING_SUBSCRIPTION_CONFLICT'; end if;
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
  -- Reservations survive saves/webhooks so failed replacement checkouts remain recoverable.
  return jsonb_build_object('id',row_id);
end $$;
revoke all on function public.billing_save_subscription(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.billing_save_subscription(uuid,jsonb) to service_role;

commit;
