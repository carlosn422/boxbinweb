begin;

-- Ensure billing_debit_tokens updates all matching public.users rows for the owner
-- so public.users and public.user_tokens never diverge when auth_user_id is populated.
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
 perform 1 from public.user_tokens where id=owner_id for update;
 perform 1 from public.users where auth_user_id=p_actor or uid=owner_id order by id for update;
 balance:=public.billing_token_balance(p_actor);
 if balance<p_tokens then raise exception 'BILLING_INSUFFICIENT_TOKENS'; end if;
 balance:=balance-p_tokens;
 insert into public.user_tokens(id,tokens,"createdAt","updatedAt") values(owner_id,balance,to_jsonb(now()::text),to_jsonb(now()::text))
 on conflict(id) do update set tokens=excluded.tokens,"updatedAt"=excluded."updatedAt";
 update public.users set tokens=to_jsonb(balance) where auth_user_id=p_actor or uid=owner_id;
 insert into public.billing_token_usage(id,actor,tokens,balance) values(p_receipt,p_actor,p_tokens,balance);
 return jsonb_build_object('debited',true,'balance',balance);
end $$;

revoke all on function public.billing_debit_tokens(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.billing_debit_tokens(uuid,text,integer) to service_role;

-- Credit 10,000 AI tokens to mendezobed98@gmail.com (idempotent by receipt id).
do $$
declare
  v_actor uuid;
  v_owner text;
begin
  select id into v_actor
  from auth.users
  where lower(email) = 'mendezobed98@gmail.com'
  order by id
  limit 1;

  if v_actor is not null then
    v_owner := public.copilot_owner(v_actor);
    -- Synchronize any pre-existing discrepancy between user_tokens and users before crediting
    update public.users
    set tokens = to_jsonb(coalesce((select tokens from public.user_tokens where id = v_owner), 624))
    where auth_user_id = v_actor or uid = v_owner;

    perform public.billing_credit_tokens(
      v_actor,
      'admin:grant:20261125:mendezobed98:10000',
      'admin_grant_10k',
      10000
    );

    update public.users
    set tokens = to_jsonb((select tokens from public.user_tokens where id = v_owner))
    where auth_user_id = v_actor or uid = v_owner;
  end if;
end $$;

commit;
