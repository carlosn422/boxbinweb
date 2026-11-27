begin;

-- Index qrcodes(guid) so dashboard bin lookups resolve QR codes via index scan.
create index if not exists qrcodes_guid_idx on public.qrcodes (guid);

-- Server-side paginated bins with exact SQL itemCount, QR code join, and multi-word search across bins + items.
-- Runs as SECURITY INVOKER so existing RLS policies (owner + shared_access) are enforced automatically.
create or replace function public.app_dashboard_bins(
  p_owner_id text,
  p_search text default '',
  p_location_id text default null,
  p_offset integer default 0,
  p_limit integer default 12
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  needle text := trim(translate(lower(left(coalesce(p_search, ''), 200)), 'áéíóúüñ', 'aeiouun'));
  tokens text[];
  safe_offset integer := greatest(0, coalesce(p_offset, 0));
  safe_limit integer := least(100, greatest(1, coalesce(p_limit, 12)));
  result jsonb;
begin
  if p_owner_id is null or trim(p_owner_id) = '' then
    return jsonb_build_object('rows', '[]'::jsonb, 'totalCount', 0, 'hasMore', false);
  end if;

  if needle = '' then
    tokens := array[]::text[];
  else
    tokens := (regexp_split_to_array(needle, '\s+'))[1:8];
  end if;

  with item_counts as materialized (
    select
      i."binId"::text as bin_id,
      count(*)::bigint as item_count,
      case
        when needle = '' then false
        else bool_or(
          not exists (
            select 1
            from unnest(tokens) as tok
            where tok <> ''
              and position(tok in translate(lower(coalesce(concat_ws(' ', i.name, i.description, i.tags::text), '')), 'áéíóúüñ', 'aeiouun')) = 0
          )
        )
      end as has_matching_item
    from public.items i
    where i."userId"::text = p_owner_id
    group by i."binId"::text
  ),
  matched_bins as materialized (
    select
      b.id,
      b."createdAt",
      to_jsonb(b)
        || case when q."qrcodeId" is not null then jsonb_build_object('qrcodeId', q."qrcodeId") else '{}'::jsonb end
        || jsonb_build_object('itemCount', coalesce(ic.item_count, 0)) as row_data
    from public.bins b
    left join public.qrcodes q on q.guid = (to_jsonb(b)->>'qrGuid')
    left join item_counts ic on ic.bin_id = b.id::text
    where b."userId"::text = p_owner_id
      and (p_location_id is null or b.location->>'id' = p_location_id)
      and (
        needle = ''
        or coalesce(ic.has_matching_item, false)
        or not exists (
          select 1
          from unnest(tokens) as tok
          where tok <> ''
            and position(tok in translate(lower(coalesce(concat_ws(' ', b.name, b.description, q."qrcodeId"), '')), 'áéíóúüñ', 'aeiouun')) = 0
        )
      )
  ),
  total as (
    select count(*)::bigint as cnt from matched_bins
  ),
  paged as (
    select row_data
    from matched_bins
    order by "createdAt" desc nulls last, id desc
    offset safe_offset
    limit safe_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row_data) from paged), '[]'::jsonb),
    'totalCount', (select cnt from total),
    'hasMore', (select cnt from total) > (safe_offset + safe_limit)
  )
  into result;

  return result;
end $$;

revoke all on function public.app_dashboard_bins(text, text, text, integer, integer) from public;
grant execute on function public.app_dashboard_bins(text, text, text, integer, integer) to authenticated;

-- Server-side paginated locations with exact SQL binCount and itemCount (no 1,000-row client limit).
create or replace function public.app_dashboard_locations(
  p_owner_id text,
  p_search text default '',
  p_offset integer default 0,
  p_limit integer default 12
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  needle text := trim(translate(lower(left(coalesce(p_search, ''), 200)), 'áéíóúüñ', 'aeiouun'));
  tokens text[];
  safe_offset integer := greatest(0, coalesce(p_offset, 0));
  safe_limit integer := least(100, greatest(1, coalesce(p_limit, 12)));
  result jsonb;
begin
  if p_owner_id is null or trim(p_owner_id) = '' then
    return jsonb_build_object('rows', '[]'::jsonb, 'totalCount', 0, 'hasMore', false);
  end if;

  if needle = '' then
    tokens := array[]::text[];
  else
    tokens := (regexp_split_to_array(needle, '\s+'))[1:8];
  end if;

  with item_counts as (
    select i."binId"::text as bin_id, count(*)::bigint as item_count
    from public.items i
    where i."userId"::text = p_owner_id
    group by i."binId"::text
  ),
  loc_stats as materialized (
    select
      b.location->>'id' as loc_id,
      count(*)::bigint as bin_count,
      coalesce(sum(coalesce(ic.item_count, 0)), 0)::bigint as item_count
    from public.bins b
    left join item_counts ic on ic.bin_id = b.id::text
    where b."userId"::text = p_owner_id
      and b.location->>'id' is not null
    group by b.location->>'id'
  ),
  matched_locs as materialized (
    select
      l.id,
      l."createdAt",
      to_jsonb(l)
        || jsonb_build_object(
          'binCount', coalesce(ls.bin_count, 0),
          'itemCount', coalesce(ls.item_count, 0)
        ) as row_data
    from public.locations l
    left join loc_stats ls on ls.loc_id = l.id::text
    where l."userId"::text = p_owner_id
      and (
        needle = ''
        or not exists (
          select 1
          from unnest(tokens) as tok
          where tok <> ''
            and position(tok in translate(lower(coalesce(concat_ws(' ', l.name, l.description, to_jsonb(l)->>'address'), '')), 'áéíóúüñ', 'aeiouun')) = 0
        )
      )
  ),
  total as (
    select count(*)::bigint as cnt from matched_locs
  ),
  paged as (
    select row_data
    from matched_locs
    order by "createdAt" desc nulls last, id desc
    offset safe_offset
    limit safe_limit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row_data) from paged), '[]'::jsonb),
    'totalCount', (select cnt from total),
    'hasMore', (select cnt from total) > (safe_offset + safe_limit)
  )
  into result;

  return result;
end $$;

revoke all on function public.app_dashboard_locations(text, text, integer, integer) from public;
grant execute on function public.app_dashboard_locations(text, text, integer, integer) to authenticated;

-- Lightweight aggregated item counts per bin (1 row per bin, no 1,000-item truncation).
create or replace function public.app_bin_item_counts(p_owner_ids text[])
returns table("binId" text, "itemCount" bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select i."binId"::text as "binId", count(*)::bigint as "itemCount"
  from public.items i
  where i."userId"::text = any(coalesce(p_owner_ids, array[]::text[]))
  group by i."binId"::text
$$;

revoke all on function public.app_bin_item_counts(text[]) from public;
grant execute on function public.app_bin_item_counts(text[]) to authenticated;

commit;
