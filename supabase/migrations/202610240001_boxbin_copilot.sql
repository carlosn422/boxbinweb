begin;

-- Optional trusted mapping for migrated inventory IDs; all authentication and data live in Supabase.
create table if not exists public.copilot_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  inventory_user_id text not null unique
);
alter table public.copilot_accounts enable row level security;
revoke all on public.copilot_accounts from anon, authenticated;
grant all on public.copilot_accounts to service_role;

-- Keep the app's inventory owner consistent with the server-only mapping.
create or replace function public.copilot_sync_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'DELETE' then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) - 'inventory_user_id' where id = old.auth_user_id;
    return old;
  end if;
  if TG_OP = 'UPDATE' and old.auth_user_id <> new.auth_user_id then raise exception 'COPILOT_INVALID'; end if;
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('inventory_user_id',new.inventory_user_id) where id = new.auth_user_id;
  return new;
end $$;
drop trigger if exists copilot_sync_owner on public.copilot_accounts;
create trigger copilot_sync_owner after insert or update or delete on public.copilot_accounts for each row execute function public.copilot_sync_owner();

create or replace function public.copilot_owner(p_actor uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id text; u auth.users%rowtype;
begin
  select * into u from auth.users where id = p_actor;
  if not found then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  select inventory_user_id into owner_id from public.copilot_accounts where auth_user_id = p_actor;
  if owner_id is not null then return owner_id; end if;
  owner_id := nullif(u.raw_app_meta_data->>'inventory_user_id', '');
  if owner_id is not null then return owner_id; end if;
  return p_actor::text;
end $$;

create table if not exists public.copilot_chats (
  id text primary key,
  "userId" uuid not null references auth.users(id) on delete cascade,
  "binId" text,
  title text not null check (length(title) between 1 and 160),
  messages jsonb not null default '[]'::jsonb,
  "messageCount" integer not null default 0,
  "filesCount" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint copilot_chat_messages check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 21 and octet_length(messages::text) <= 500000)
);
alter table public.copilot_chats enable row level security;
revoke all on public.copilot_chats from anon, authenticated;
grant select, insert, update, delete on public.copilot_chats to authenticated;
grant all on public.copilot_chats to service_role;
drop policy if exists copilot_own_chats on public.copilot_chats;
create policy copilot_own_chats on public.copilot_chats for all to authenticated
using ("userId" = auth.uid()) with check ("userId" = auth.uid());
-- Restrictive policy also protects against any pre-existing permissive policy.
drop policy if exists copilot_owner_guard on public.copilot_chats;
create policy copilot_owner_guard on public.copilot_chats as restrictive for all to authenticated
using ("userId" = auth.uid()) with check ("userId" = auth.uid());
create index if not exists copilot_chats_owner_updated on public.copilot_chats ("userId", "updatedAt" desc);

create or replace function public.copilot_chat_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' and new."userId" <> old."userId" then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('copilot-chat:' || new."userId"::text, 0));
  if TG_OP = 'INSERT' and not exists (select 1 from public.copilot_chats where id = new.id)
     and (select count(*) from public.copilot_chats where "userId" = new."userId") >= 10 then
    raise exception 'COPILOT_CHAT_LIMIT';
  end if;
  new."messageCount" := jsonb_array_length(new.messages);
  new."updatedAt" := now();
  return new;
end $$;
drop trigger if exists copilot_chat_limit on public.copilot_chats;
create trigger copilot_chat_limit before insert or update on public.copilot_chats for each row execute function public.copilot_chat_limit();

create table if not exists public.copilot_usage (
  actor uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  day date not null,
  calls integer not null default 0,
  primary key (actor, kind, day)
);
alter table public.copilot_usage enable row level security;
revoke all on public.copilot_usage from anon, authenticated;
grant all on public.copilot_usage to service_role;
create or replace function public.copilot_take_quota(p_actor uuid, p_kind text, p_limit integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  insert into public.copilot_usage(actor, kind, day, calls) values(p_actor, p_kind, (now() at time zone 'UTC')::date, 1)
  on conflict(actor, kind, day) do update set calls = copilot_usage.calls + 1 returning calls into n;
  if n > p_limit then raise exception 'COPILOT_QUOTA'; end if;
end $$;

-- Invalid values are unknown, not silently zero. Accept unambiguous US grouping.
create or replace function public.copilot_number(v text) returns numeric
language sql immutable set search_path = public, pg_temp as $$
  select case when trim(v) ~ '^[$]?([0-9]+|[0-9]{1,3}(,[0-9]{3})+)(\.[0-9]+)?$'
    then replace(replace(trim(v), ',', ''), '$', '')::numeric else null end
$$;
create or replace function public.copilot_normalize(v text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select translate(lower(coalesce(v, '')), 'áéíóúüñ', 'aeiouun')
$$;

-- Match the owner filters used by the RPCs, regardless of migrated text/UUID IDs.
create index if not exists copilot_items_owner_bin on public.items (("userId"::text), ("binId"::text), (id::text));
create index if not exists copilot_bins_owner on public.bins (("userId"::text), (id::text));
create index if not exists copilot_locations_owner on public.locations (("userId"::text), (id::text));

-- All inventory RPCs are service-only; actor comes from validated Supabase Auth.
create or replace function public.copilot_inventory(
  p_actor uuid, p_bin_id text default null, p_search text default '', p_offset integer default 0, p_limit integer default 50, p_lang text default 'en'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id text := public.copilot_owner(p_actor); result jsonb; active jsonb; needle text := public.copilot_normalize(left(p_search, 200));
begin
  if p_limit not between 1 and 1500 or p_offset not between 0 and 1000000 then raise exception 'COPILOT_INVALID'; end if;
  if p_bin_id is not null then
    select to_jsonb(b) into active from public.bins b where b.id::text = p_bin_id and b."userId"::text = owner_id;
    if active is null then raise exception 'COPILOT_NOT_FOUND'; end if;
  end if;
  with owned_bins as (
    select b.id::text id, b.name, b.description, b.location from public.bins b
    where b."userId"::text = owner_id and (p_bin_id is null or b.id::text = p_bin_id)
  ), owned_items as (
    select i.id::text id, i.name, i.description, i.tags,
      coalesce(nullif(i.cuantity::text, ''), to_jsonb(i)->>'quantity') cuantity,
      to_jsonb(i)->>'value' value, i."binId"::text "binId",
      b.name "binName", coalesce(b.location->>'name', case when lower(coalesce(p_lang, 'en')) = 'es' then 'Sin ubicación' else 'No location' end) "locationName",
      public.copilot_number(to_jsonb(i)->>'value') val,
      public.copilot_number(coalesce(nullif(i.cuantity::text, ''), to_jsonb(i)->>'quantity')) qty
    from public.items i left join owned_bins b on b.id = i."binId"::text
    where i."userId"::text = owner_id and (p_bin_id is null or i."binId"::text = p_bin_id)
  ), matched_items as (
    select * from owned_items where needle = '' or position(needle in public.copilot_normalize(
      concat_ws(' ', name, description, tags::text, "binName", "locationName"))) > 0
  ), matched_bins as (
    select b.*, (select count(*) from owned_items i where i."binId" = b.id) "itemCount"
    from owned_bins b where needle = '' or position(needle in public.copilot_normalize(concat_ws(' ', b.name, b.description, b.location::text))) > 0
  ), matched_locations as (
    select l.id::text id, l.name, l.address, l.description from public.locations l
    where l."userId"::text = owner_id
      and (p_bin_id is null or l.id::text = active->'location'->>'id')
      and (needle = '' or position(needle in public.copilot_normalize(concat_ws(' ', l.name, l.address, l.description))) > 0)
  ) select jsonb_build_object(
    'activeBin', case when active is null then null else jsonb_build_object('id', active->>'id', 'name', active->>'name', 'location', active->'location', 'description', active->>'description') end,
    'inventoryMetrics', jsonb_build_object(
      'scope', case when p_bin_id is null then 'global' else 'bin' end,
      'totalBins', (select count(*) from owned_bins),
      'totalItems', (select count(*) from owned_items),
      'totalLocations', (select count(*) from public.locations l where l."userId"::text = owner_id and (p_bin_id is null or l.id::text = active->'location'->>'id')),
      'totalUnits', (select coalesce(sum(qty),0) from owned_items),
      'totalEstimatedValue', (select coalesce(sum(val * qty),0) from owned_items),
      'unvaluedItems', (select count(*) from owned_items where val is null or qty is null)
    ),
    'binsSummary', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from matched_bins order by id offset p_offset limit p_limit) x),
    'locationsSummary', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from matched_locations order by id offset p_offset limit p_limit) x),
    'itemsSample', (select coalesce(jsonb_agg(to_jsonb(x) - 'val' - 'qty'), '[]'::jsonb) from (select * from matched_items order by id offset p_offset limit p_limit) x),
    'matches', jsonb_build_object('items', (select count(*) from matched_items), 'bins', (select count(*) from matched_bins), 'locations', (select count(*) from matched_locations)),
    'offset', p_offset, 'limit', p_limit, 'search', p_search,
    'hasMore', greatest((select count(*) from matched_items), (select count(*) from matched_bins), (select count(*) from matched_locations)) > p_offset + p_limit
  ) into result;
  return result;
end $$;

create table if not exists public.copilot_operations (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor, request_id)
);
alter table public.copilot_operations enable row level security;
revoke all on public.copilot_operations from anon, authenticated;
grant all on public.copilot_operations to service_role;

create or replace function public.copilot_execute(
  p_actor uuid, p_request_id text, p_type text, p_data jsonb, p_limits jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id text := public.copilot_owner(p_actor); b public.bins%rowtype; l public.locations%rowtype;
  i public.items%rowtype; result jsonb; old_op public.copilot_operations%rowtype;
  item_limit integer := (p_limits->>'items')::integer; bin_limit integer := (p_limits->>'bins')::integer;
  location_limit integer := (p_limits->>'locations')::integer;
  request jsonb := jsonb_build_object('type', p_type, 'data', p_data);
  loc jsonb := null;
begin
  if p_request_id !~ '^[A-Za-z0-9_-]{8,120}$' or item_limit is null or bin_limit is null or location_limit is null then raise exception 'COPILOT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('copilot-write:' || owner_id, 0));
  select * into old_op from public.copilot_operations where actor = p_actor and request_id = p_request_id;
  if found then
    if old_op.request <> request then raise exception 'COPILOT_REQUEST_CHANGED'; end if;
    return old_op.result;
  end if;
  if p_type in ('create_item','create_bin','create_location') and (length(trim(coalesce(p_data->>'name',''))) not between 1 and 200) then raise exception 'COPILOT_INVALID'; end if;
  if p_type in ('create_item','move_item','assign_location') then
    select * into b from public.bins where id::text = coalesce(p_data->>'destinationBinId', p_data->>'binId') and "userId"::text = owner_id for update;
    if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
  end if;
  if p_type in ('assign_location','create_bin') and nullif(p_data->>'locationId','') is not null then
    select * into l from public.locations where id::text = p_data->>'locationId' and "userId"::text = owner_id for share;
    if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
    loc := jsonb_build_object('id', l.id, 'name', l.name, 'address', l.address);
  end if;
  if p_type = 'create_item' then
    if public.copilot_number(p_data->>'cuantity') is null or public.copilot_number(p_data->>'value') is null
       or public.copilot_number(p_data->>'cuantity') <= 0 then raise exception 'COPILOT_INVALID'; end if;
    if (select count(*) from public.items where "userId"::text = owner_id and "binId" = b.id) >= item_limit then raise exception 'COPILOT_PLAN_LIMIT'; end if;
    -- Populate through the existing row type: compatible with text/uuid IDs and text/numeric quantities.
    i := jsonb_populate_record(null::public.items, jsonb_build_object('id', gen_random_uuid(), 'name', trim(p_data->>'name'), 'description', coalesce(p_data->>'description',''),
      'cuantity', p_data->>'cuantity', 'value', public.copilot_number(p_data->>'value'), 'tags', coalesce(p_data->'tags','[]'::jsonb), 'binId', b.id, 'userId', owner_id, 'createdAt', now()));
    insert into public.items(id, name, description, cuantity, value, tags, "binId", "userId", "createdAt")
      values(i.id,i.name,i.description,i.cuantity,i.value,i.tags,i."binId",i."userId",i."createdAt") returning * into i;
    result := jsonb_build_object('itemId', i.id::text, 'name', i.name);
  elsif p_type = 'move_item' then
    select * into i from public.items where id::text = p_data->>'itemId' and "userId"::text = owner_id for update;
    if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
    if i."binId"::text is distinct from p_data->>'sourceBinId' then raise exception 'COPILOT_STALE_ITEM'; end if;
    if i."binId" <> b.id and (select count(*) from public.items where "userId"::text = owner_id and "binId" = b.id) >= item_limit then raise exception 'COPILOT_PLAN_LIMIT'; end if;
    update public.items set "binId" = b.id where id = i.id and "userId"::text = owner_id;
    result := jsonb_build_object('message', 'Item moved successfully.');
  elsif p_type = 'assign_location' then
    if loc is null then raise exception 'COPILOT_INVALID'; end if;
    update public.bins set location = loc where id = b.id and "userId"::text = owner_id;
    result := jsonb_build_object('message', 'Location assigned to container successfully.');
  elsif p_type = 'create_bin' then
    if (select count(*) from public.bins where "userId"::text = owner_id) >= bin_limit then raise exception 'COPILOT_PLAN_LIMIT'; end if;
    b := jsonb_populate_record(null::public.bins, jsonb_build_object('id', gen_random_uuid(), 'name', trim(p_data->>'name'), 'description', coalesce(p_data->>'description',''), 'location', loc, 'userId', owner_id, 'createdAt', now()));
    insert into public.bins(id, name, description, location, "userId", "createdAt") values(b.id,b.name,b.description,b.location,b."userId",b."createdAt") returning * into b;
    result := jsonb_build_object('binId', b.id::text, 'name', b.name);
  elsif p_type = 'create_location' then
    if (select count(*) from public.locations where "userId"::text = owner_id) >= location_limit then raise exception 'COPILOT_PLAN_LIMIT'; end if;
    l := jsonb_populate_record(null::public.locations, jsonb_build_object('id', gen_random_uuid(), 'name', trim(p_data->>'name'), 'description', coalesce(p_data->>'description',''), 'address', coalesce(p_data->>'address',''), 'userId', owner_id, 'createdAt', now()));
    insert into public.locations(id,name,address,description,"userId","createdAt") values(l.id,l.name,l.address,l.description,l."userId",l."createdAt") returning * into l;
    result := jsonb_build_object('locationId', l.id::text, 'name', l.name);
  else raise exception 'COPILOT_INVALID';
  end if;
  insert into public.copilot_operations(actor,request_id,request,result) values(p_actor,p_request_id,request,result);
  return result;
end $$;

create table if not exists public.copilot_images (
  actor uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  request_hash text not null,
  lease uuid not null default gen_random_uuid(),
  busy_until timestamptz not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key(actor, request_id)
);
alter table public.copilot_images enable row level security;
revoke all on public.copilot_images from anon, authenticated;
grant all on public.copilot_images to service_role;
create or replace function public.copilot_claim_image(p_actor uuid, p_request_id text, p_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.copilot_images%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('copilot-image:' || p_actor::text, 0));
  select * into row from public.copilot_images where actor = p_actor and request_id = p_request_id for update;
  if found then
    if row.request_hash <> p_hash then raise exception 'COPILOT_REQUEST_CHANGED'; end if;
    if row.result is not null then return jsonb_build_object('result', row.result); end if;
    if row.busy_until > now() then raise exception 'COPILOT_BUSY'; end if;
  end if;
  if exists(select 1 from public.copilot_images where actor = p_actor and result is null and busy_until > now()) then raise exception 'COPILOT_BUSY'; end if;
  perform public.copilot_take_quota(p_actor, 'image', 20);
  insert into public.copilot_images(actor,request_id,request_hash,busy_until) values(p_actor,p_request_id,p_hash,now()+interval '3 minutes')
  on conflict(actor,request_id) do update set lease = gen_random_uuid(), busy_until = excluded.busy_until returning * into row;
  return jsonb_build_object('lease', row.lease);
end $$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Explicitly close every RPC.
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace = 'public'::regnamespace and proname like 'copilot_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
commit;
