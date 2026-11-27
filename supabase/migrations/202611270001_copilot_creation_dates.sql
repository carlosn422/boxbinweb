begin;

-- Read-only compatibility parser for ISO timestamps and legacy Firestore dates.
-- Does not backfill or alter any historical item date.
create or replace function public.copilot_created_at_timestamp(value jsonb)
returns timestamptz language plpgsql immutable set search_path = public, pg_temp as $$
declare raw text; seconds numeric; nanos numeric;
begin
  if value is null or value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(value) = 'string' then
    raw := value #>> '{}';
    if raw ~ '^\s*\{' then value := raw::jsonb;
    elsif raw ~ '^\d{4}-\d{2}-\d{2}[Tt ].*(Z|[+-]\d{2}(:?\d{2})?)$' then
      return raw::timestamptz;
    else return null;
    end if;
  end if;
  if jsonb_typeof(value) = 'object' then
    seconds := coalesce(value->>'seconds', value->>'_seconds')::numeric;
    nanos := coalesce(value->>'nanoseconds', value->>'_nanoseconds', '0')::numeric;
    if seconds is null or nanos < 0 or nanos >= 1000000000 then return null; end if;
    return to_timestamp((seconds + nanos / 1000000000)::double precision);
  end if;
  return null;
exception when others then return null;
end $$;
revoke all on function public.copilot_created_at_timestamp(jsonb) from public, anon, authenticated;
grant execute on function public.copilot_created_at_timestamp(jsonb) to service_role;

create or replace function public.copilot_inventory(
  p_actor uuid, p_bin_id text default null, p_search text default '', p_offset integer default 0, p_limit integer default 50, p_lang text default 'en'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  owner_id text := public.copilot_owner(p_actor);
  result jsonb;
  active jsonb;
  needle text := trim(public.copilot_normalize(left(coalesce(p_search, ''), 200)));
  tokens text[];
  unassigned_label text := case when lower(coalesce(p_lang, 'en')) = 'es' then 'Sin ubicación' else 'No location' end;
begin
  if p_limit not between 1 and 1500 or p_offset not between 0 and 1000000 then
    raise exception 'COPILOT_INVALID';
  end if;

  if p_bin_id is not null then
    select to_jsonb(b) into active
    from public.bins b
    where b.id::text = p_bin_id and b."userId"::text = owner_id;
    if active is null then raise exception 'COPILOT_NOT_FOUND'; end if;
  end if;

  if needle = '' then
    tokens := array[]::text[];
  else
    tokens := (regexp_split_to_array(needle, '\s+'))[1:8];
  end if;

  with owned_bins as materialized (
    select b.id::text as id, b.name, b.description, b.location
    from public.bins b
    where b."userId"::text = owner_id
      and (p_bin_id is null or b.id::text = p_bin_id)
  ),
  owned_items as materialized (
    select
      i.id::text as id,
      i.name,
      i.description,
      i.tags,
      j->'createdAt' as "createdAt",
      public.copilot_created_at_timestamp(j->'createdAt') as created_at_ts,
      coalesce(nullif(i.cuantity::text, ''), j->>'quantity') as cuantity,
      j->>'value' as value,
      i."binId"::text as "binId",
      b.name as "binName",
      coalesce(b.location->>'name', unassigned_label) as "locationName",
      public.copilot_number(j->>'value') as val,
      public.copilot_number(coalesce(nullif(i.cuantity::text, ''), j->>'quantity')) as qty
    from public.items i
    cross join lateral (select to_jsonb(i) as j) raw_item
    left join owned_bins b on b.id = i."binId"::text
    where i."userId"::text = owner_id
      and (p_bin_id is null or i."binId"::text = p_bin_id)
  ),
  bin_counts as (
    select "binId", count(*)::bigint as cnt
    from owned_items
    group by "binId"
  ),
  item_metrics as (
    select
      count(*)::bigint as total_items,
      coalesce(sum(qty), 0) as total_units,
      coalesce(sum(val * qty), 0) as total_value,
      count(*) filter (where val is null or qty is null)::bigint as unvalued_items
    from owned_items
  ),
  owned_locations as materialized (
    select l.id::text as id, l.name, l.address, l.description
    from public.locations l
    where l."userId"::text = owner_id
      and (p_bin_id is null or l.id::text = active->'location'->>'id')
  ),
  matched_items as materialized (
    select id, name, description, tags, "createdAt", cuantity, value, "binId", "binName", "locationName"
    from owned_items
    where needle = ''
       or not exists (
            select 1
            from unnest(tokens) as tok
            where tok <> ''
              and position(tok in public.copilot_normalize(concat_ws(' ', name, description, tags::text, "binName", "locationName"))) = 0
          )
  ),
  matched_bins as materialized (
    select b.id, b.name, b.description, b.location, coalesce(bc.cnt, 0) as "itemCount"
    from owned_bins b
    left join bin_counts bc on bc."binId" = b.id
    where needle = ''
       or not exists (
            select 1
            from unnest(tokens) as tok
            where tok <> ''
              and position(tok in public.copilot_normalize(concat_ws(' ', b.name, b.description, b.location::text))) = 0
          )
  ),
  matched_locations as materialized (
    select id, name, address, description
    from owned_locations
    where needle = ''
       or not exists (
            select 1
            from unnest(tokens) as tok
            where tok <> ''
              and position(tok in public.copilot_normalize(concat_ws(' ', name, address, description))) = 0
          )
  ),
  match_counts as (
    select
      (select count(*)::bigint from matched_items) as items_cnt,
      (select count(*)::bigint from matched_bins) as bins_cnt,
      (select count(*)::bigint from matched_locations) as locations_cnt
  )
  select jsonb_build_object(
    'activeBin', case when active is null then null else jsonb_build_object(
      'id', active->>'id',
      'name', active->>'name',
      'location', active->'location',
      'description', active->>'description'
    ) end,
    'inventoryMetrics', jsonb_build_object(
      'scope', case when p_bin_id is null then 'global' else 'bin' end,
      'totalBins', (select count(*) from owned_bins),
      'totalItems', im.total_items,
      'totalLocations', (select count(*) from owned_locations),
      'totalUnits', im.total_units,
      'totalEstimatedValue', im.total_value,
      'unvaluedItems', im.unvalued_items
    ),
    'itemsWithoutCreationDate', (select count(*) from owned_items where created_at_ts is null),
    'latestItems', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select id, name, "binId", "binName", "locationName", "createdAt", created_at_ts as "createdAtNormalized"
      from owned_items where created_at_ts is not null
      order by created_at_ts desc, id limit 2
    ) x),
    'binsSummary', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from matched_bins order by id offset p_offset limit p_limit) x),
    'locationsSummary', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from matched_locations order by id offset p_offset limit p_limit) x),
    'itemsSample', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from matched_items order by id offset p_offset limit p_limit) x),
    'matches', jsonb_build_object('items', mc.items_cnt, 'bins', mc.bins_cnt, 'locations', mc.locations_cnt),
    'offset', p_offset,
    'limit', p_limit,
    'search', p_search,
    'hasMore', greatest(mc.items_cnt, mc.bins_cnt, mc.locations_cnt) > p_offset + p_limit
  )
  into result
  from item_metrics im, match_counts mc;

  return result;
end $$;

revoke all on function public.copilot_inventory(uuid, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.copilot_inventory(uuid, text, text, integer, integer, text) to service_role;


commit;
