begin;
alter table public.qrcodes alter column id set default gen_random_uuid();
alter table public.shared_access alter column id set default gen_random_uuid();
alter table public.subscriptions alter column id set default gen_random_uuid();
alter table public.qrcodes add column if not exists "requestId" text;

-- Profile creation must derive identity from Auth, not caller-supplied UID fields.
create or replace function public.app_sync_profile() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); owner_id text; u auth.users%rowtype; profile_id text; label text;
begin
  if actor is null then raise exception 'APP_UNAUTHORIZED'; end if;
  owner_id:=public.copilot_owner(actor);
  perform pg_advisory_xact_lock(hashtextextended('profile:'||actor::text,0));
  select * into u from auth.users where id=actor;
  select id into profile_id from public.users where auth_user_id=actor
    or (uid=owner_id and auth_user_id is null) order by (auth_user_id=actor) desc nulls last,id limit 1 for update;
  label:=coalesce(u.raw_user_meta_data->>'displayName',u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',split_part(u.email,'@',1),'User');
  if profile_id is null then
    profile_id:=gen_random_uuid()::text;
    insert into public.users(id,uid,auth_user_id,email,"displayName","photoURL",username,"createdAt","lastLogin")
    values(profile_id,owner_id,actor,coalesce(u.email,''),label,coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture',''),
      'user_'||replace(actor::text,'-',''),to_jsonb(now()::text),to_jsonb(now()::text));
  else
    update public.users set auth_user_id=actor,email=coalesce(u.email,''),"displayName"=label,
      "photoURL"=coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture',''),"lastLogin"=to_jsonb(now()::text)
    where id=profile_id;
  end if;
  return jsonb_build_object('id',profile_id);
end $$;
revoke all on function public.app_sync_profile() from public;
grant execute on function public.app_sync_profile() to authenticated;

create or replace function public.app_grant_access(p_username text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text; recipient text; target public.users%rowtype; share_id text;
begin
  if auth.uid() is null then raise exception 'APP_UNAUTHORIZED'; end if;
  if length(trim(p_username)) not between 1 and 150 then raise exception 'APP_INVALID_USERNAME'; end if;
  owner_id:=public.copilot_owner(auth.uid());
  if (select count(*) from public.users where username=trim(p_username))<>1 then raise exception 'APP_USER_NOT_FOUND'; end if;
  select * into target from public.users where username=trim(p_username);
  recipient:=case when target.auth_user_id is not null then public.copilot_owner(target.auth_user_id) else target.uid end;
  if recipient is null or recipient=owner_id then raise exception 'APP_INVALID_RECIPIENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('share:'||owner_id||':'||recipient,0));
  select id into share_id from public.shared_access where "ownerUserId"=owner_id and "grantedUserId"=recipient order by id limit 1;
  if share_id is null then
    insert into public.shared_access("ownerUserId","grantedUserId","createdAt") values(owner_id,recipient,now()::text) returning id into share_id;
  end if;
  return jsonb_build_object('id',share_id);
end $$;
revoke all on function public.app_grant_access(text) from public;
grant execute on function public.app_grant_access(text) to authenticated;

drop policy if exists app_shared_access_owner on public.shared_access;
create policy app_shared_access_owner on public.shared_access for all to authenticated
using ("ownerUserId"=(select public.inventory_current_owner())) with check ("ownerUserId"=(select public.inventory_current_owner()));
drop policy if exists app_shared_access_recipient on public.shared_access;
create policy app_shared_access_recipient on public.shared_access for select to authenticated
using ("grantedUserId"=(select public.inventory_current_owner()));
-- Existing imported access stays in place; canonical recipients can also read.
drop policy if exists app_shared_bins on public.bins;
create policy app_shared_bins on public.bins for select to authenticated using(exists(select 1 from public.shared_access s where s."ownerUserId"=bins."userId" and s."grantedUserId"=(select public.inventory_current_owner())));
drop policy if exists app_shared_items on public.items;
create policy app_shared_items on public.items for select to authenticated using(exists(select 1 from public.shared_access s where s."ownerUserId"=items."userId" and s."grantedUserId"=(select public.inventory_current_owner())));
drop policy if exists app_shared_locations on public.locations;
create policy app_shared_locations on public.locations for select to authenticated using(exists(select 1 from public.shared_access s where s."ownerUserId"=locations."userId" and s."grantedUserId"=(select public.inventory_current_owner())));
commit;
