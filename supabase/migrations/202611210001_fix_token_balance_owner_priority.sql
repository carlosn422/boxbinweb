begin;

-- When a migrated auth user has multiple legacy rows in public.users,
-- prioritize the active inventory owner row (uid = owner_id) and non-null token balances
-- instead of picking whichever row sorts first alphabetically by id.
create or replace function public.billing_token_balance(p_actor uuid) returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; profile_balance numeric;
begin
 if auth.uid() is not null and auth.uid()<>p_actor and current_setting('role',true)<>'service_role' then raise exception 'BILLING_FORBIDDEN'; end if;
 select tokens into balance from public.user_tokens where id=owner_id;
 select case when trim(both '"' from tokens::text) ~ '^[0-9]+(\.[0-9]+)?$' then trim(both '"' from tokens::text)::numeric else null end
 into profile_balance from public.users
 where auth_user_id=p_actor or uid=owner_id
 order by (uid=owner_id) desc nulls last, (tokens is not null) desc, (auth_user_id=p_actor) desc nulls last, id
 limit 1;
 if balance is not null and profile_balance is not null and balance<>profile_balance then raise exception 'BILLING_BALANCE_CONFLICT'; end if;
 return coalesce(balance,profile_balance,0);
end $$;

create or replace function public.processing_token_balance(p_actor uuid) returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; profile_balance numeric;
begin
 if auth.uid() is not null and auth.uid()<>p_actor and current_setting('role',true)<>'service_role' then raise exception 'PROCESSING_FORBIDDEN'; end if;
 select tokens into balance from public.user_tokens where id=owner_id;
 select case when trim(both '"' from tokens::text) ~ '^[0-9]+(\.[0-9]+)?$' then trim(both '"' from tokens::text)::numeric else null end
 into profile_balance from public.users
 where auth_user_id=p_actor or uid=owner_id
 order by (uid=owner_id) desc nulls last, (tokens is not null) desc, (auth_user_id=p_actor) desc nulls last, id
 limit 1;
 if balance is not null and profile_balance is not null and balance<>profile_balance then raise exception 'PROCESSING_BALANCE_CONFLICT'; end if;
 return coalesce(balance,profile_balance,0);
end $$;

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
    into profile_balance from public.users
    where auth_user_id=p_actor or uid=owner_id
    order by (uid=owner_id) desc nulls last, (tokens is not null) desc, (auth_user_id=p_actor) desc nulls last, id
    limit 1 for update;
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

revoke all on function public.billing_token_balance(uuid) from public,anon,authenticated;
grant execute on function public.billing_token_balance(uuid) to service_role;
revoke all on function public.processing_token_balance(uuid) from public,anon,authenticated;
grant execute on function public.processing_token_balance(uuid) to service_role;
revoke all on function public.billing_credit_tokens(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.billing_credit_tokens(uuid,text,text,integer) to service_role;

commit;
