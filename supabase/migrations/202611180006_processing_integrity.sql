begin;
alter table public.image_requests alter column id set default gen_random_uuid();
alter table public.video_processing_jobs alter column id set default gen_random_uuid();
-- One balance reader for the web, app and processing API.
create or replace function public.processing_token_balance(p_actor uuid) returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; profile_balance numeric;
begin
 if auth.uid() is not null and auth.uid()<>p_actor and current_setting('role',true)<>'service_role' then raise exception 'PROCESSING_FORBIDDEN'; end if;
 select tokens into balance from public.user_tokens where id=owner_id;
 select case when trim(both '"' from tokens::text) ~ '^[0-9]+(\.[0-9]+)?$' then trim(both '"' from tokens::text)::numeric else null end
 into profile_balance from public.users where auth_user_id=p_actor or uid=owner_id order by (auth_user_id=p_actor) desc nulls last,id limit 1;
 if balance is not null and profile_balance is not null and balance<>profile_balance then raise exception 'PROCESSING_BALANCE_CONFLICT'; end if;
 return coalesce(balance,profile_balance,0);
end $$;
revoke all on function public.processing_token_balance(uuid) from public,anon,authenticated;
grant execute on function public.processing_token_balance(uuid) to service_role;
create or replace function public.app_token_balance() returns numeric
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'APP_UNAUTHORIZED'; end if;
 return public.processing_token_balance(auth.uid());
end $$;
revoke all on function public.app_token_balance() from public,anon;
grant execute on function public.app_token_balance() to authenticated;
create table if not exists public.processing_token_usage (
 id text primary key, actor uuid not null references auth.users(id), tokens integer not null check(tokens>=0), balance numeric not null, created_at timestamptz not null default now()
);
alter table public.processing_token_usage enable row level security;
revoke all on public.processing_token_usage from anon,authenticated;
grant all on public.processing_token_usage to service_role;
create or replace function public.processing_debit_tokens(p_actor uuid,p_receipt text,p_tokens integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); balance numeric; prior public.processing_token_usage%rowtype;
begin
 if p_actor is null or p_receipt is null or length(p_receipt) not between 3 and 200 or p_tokens is null or p_tokens<0 then raise exception 'PROCESSING_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tokens:'||owner_id,0));
 select * into prior from public.processing_token_usage where id=p_receipt;
 if found then
  if prior.actor<>p_actor or prior.tokens<>p_tokens then raise exception 'PROCESSING_RECEIPT_MISMATCH'; end if;
  return jsonb_build_object('debited',false,'balance',prior.balance);
 end if;
 -- Lock both existing stores in the same order as credits before reading.
 perform 1 from public.user_tokens where id=owner_id for update;
 perform 1 from public.users where auth_user_id=p_actor or uid=owner_id order by id for update;
 balance:=public.processing_token_balance(p_actor);
 if balance<p_tokens then raise exception 'PROCESSING_INSUFFICIENT_TOKENS'; end if;
 balance:=balance-p_tokens;
 insert into public.user_tokens(id,tokens,"createdAt","updatedAt") values(owner_id,balance,to_jsonb(now()::text),to_jsonb(now()::text))
 on conflict(id) do update set tokens=excluded.tokens,"updatedAt"=excluded."updatedAt";
 update public.users set tokens=to_jsonb(balance) where auth_user_id=p_actor or (uid=owner_id and auth_user_id is null);
 insert into public.processing_token_usage(id,actor,tokens,balance) values(p_receipt,p_actor,p_tokens,balance);
 return jsonb_build_object('debited',true,'balance',balance);
end $$;
revoke all on function public.processing_debit_tokens(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.processing_debit_tokens(uuid,text,integer) to service_role;
commit;
