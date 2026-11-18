begin;

-- The frontend and Copilot use trusted inventory_user_id (or auth.uid()).
-- Existing Firebase-era policies can resolve a different ID or no profile at all.
-- Add canonical owner access without removing legacy access: production still
-- contains inventory under legacy IDs, which must not be reassigned implicitly.
create or replace function public.inventory_current_owner() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is not null then public.copilot_owner(auth.uid()) end
$$;
revoke all on function public.inventory_current_owner() from public;
grant execute on function public.inventory_current_owner() to authenticated;
drop policy if exists inventory_canonical_owner on public.bins;
create policy inventory_canonical_owner on public.bins for all to authenticated
using ("userId" = (select public.inventory_current_owner()))
with check ("userId" = (select public.inventory_current_owner()));
drop policy if exists inventory_canonical_owner on public.items;
create policy inventory_canonical_owner on public.items for all to authenticated
using ("userId" = (select public.inventory_current_owner()))
with check ("userId" = (select public.inventory_current_owner()));
drop policy if exists inventory_canonical_owner on public.locations;
create policy inventory_canonical_owner on public.locations for all to authenticated
using ("userId" = (select public.inventory_current_owner()))
with check ("userId" = (select public.inventory_current_owner()));

-- Imported IDs remain unchanged. New rows also work for clients that omit id.
alter table public.bins alter column id set default gen_random_uuid();
alter table public.items alter column id set default gen_random_uuid();
alter table public.locations alter column id set default gen_random_uuid();

-- Run with the caller's permissions and existing RLS policies, never bypass RLS.
create or replace function public.inventory_bin_delete_children() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  delete from public.items where "binId"::text = old.id::text and "userId"::text = old."userId"::text;
  if exists(select 1 from public.items where "binId"::text = old.id::text) then
    raise exception 'INVENTORY_ITEMS_DELETE_DENIED';
  end if;
  update public.qrcodes set "binId" = null, "isUsed" = false, "dateUsed" = null
    where "binId" #>> '{}' = old.id::text and "userId"::text = old."userId"::text;
  if exists(select 1 from public.qrcodes where "binId" #>> '{}' = old.id::text) then
    raise exception 'INVENTORY_QR_RELEASE_DENIED';
  end if;
  return old;
end $$;
drop trigger if exists inventory_bin_delete_children on public.bins;
create trigger inventory_bin_delete_children before delete on public.bins
for each row execute function public.inventory_bin_delete_children();

-- Locations are embedded JSON in bins, not a foreign key. Keep those copies
-- current, and detach bins when deleting a location without deleting inventory.
create or replace function public.inventory_location_sync() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    update public.bins set location = null
      where "userId"::text = old."userId"::text and location->>'id' = old.id::text;
    if exists(select 1 from public.bins where "userId"::text = old."userId"::text and location->>'id' = old.id::text) then
      raise exception 'INVENTORY_LOCATION_DETACH_DENIED';
    end if;
    return old;
  end if;
  update public.bins set location = location || jsonb_build_object('name', new.name, 'address', new.address)
    where "userId"::text = new."userId"::text and location->>'id' = new.id::text;
  if exists(select 1 from public.bins where "userId"::text = new."userId"::text and location->>'id' = new.id::text
    and (location->>'name' is distinct from new.name or location->>'address' is distinct from new.address)) then
    raise exception 'INVENTORY_LOCATION_SYNC_DENIED';
  end if;
  return new;
end $$;
drop trigger if exists inventory_location_sync_update on public.locations;
create trigger inventory_location_sync_update after update of name, address on public.locations
for each row execute function public.inventory_location_sync();
drop trigger if exists inventory_location_sync_delete on public.locations;
create trigger inventory_location_sync_delete before delete on public.locations
for each row execute function public.inventory_location_sync();

-- Validate and lock the parent while a child is being written, including the
-- owner. This prevents new stale references racing with a deletion.
create or replace function public.inventory_validate_parent() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent_location public.locations%rowtype;
begin
  if TG_TABLE_NAME = 'items' then
    perform 1 from public.bins where id::text = new."binId"::text and "userId"::text = new."userId"::text for share;
    if not found then raise exception 'INVENTORY_BIN_UNAVAILABLE'; end if;
  elsif new.location is not null and new.location->>'id' is not null then
    select * into parent_location from public.locations
      where id::text = new.location->>'id' and "userId"::text = new."userId"::text for share;
    if not found then raise exception 'INVENTORY_LOCATION_UNAVAILABLE'; end if;
    new.location := new.location || jsonb_build_object('name', parent_location.name, 'address', parent_location.address);
  end if;
  return new;
end $$;
drop trigger if exists inventory_item_parent on public.items;
create trigger inventory_item_parent before insert or update of "binId", "userId" on public.items
for each row execute function public.inventory_validate_parent();
drop trigger if exists inventory_bin_parent on public.bins;
create trigger inventory_bin_parent before insert or update of location, "userId" on public.bins
for each row execute function public.inventory_validate_parent();

revoke all on function public.inventory_bin_delete_children() from public;
revoke all on function public.inventory_location_sync() from public;
revoke all on function public.inventory_validate_parent() from public;
-- A dedicated entrypoint makes older databases fail closed until this migration
-- is installed. RLS still decides which parent and child rows may be changed.
create or replace function public.inventory_delete_record(p_table text, p_owner text, p_id text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare deleted_id text;
begin
  if p_table = 'bins' then
    delete from public.bins where id = p_id and "userId" = p_owner returning id into deleted_id;
  elsif p_table = 'locations' then
    delete from public.locations where id = p_id and "userId" = p_owner returning id into deleted_id;
  else
    raise exception 'INVENTORY_INVALID_TABLE';
  end if;
  if deleted_id is null then raise exception 'INVENTORY_RECORD_UNAVAILABLE'; end if;
  return jsonb_build_object('id', deleted_id);
end $$;
revoke all on function public.inventory_delete_record(text,text,text) from public;
grant execute on function public.inventory_delete_record(text,text,text) to authenticated;
commit;
