-- Ensure copilot_inventory accepts p_lang parameter
drop function if exists public.copilot_inventory(uuid, text, text, integer, integer);

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

revoke all on function public.copilot_inventory(uuid, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.copilot_inventory(uuid, text, text, integer, integer, text) to service_role;

