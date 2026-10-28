begin;
-- Keep the migrated quantity column consistent with the application's cuantity field.
alter table public.items add column if not exists quantity numeric;

create or replace function public.copilot_prepare_edit(p_actor uuid,p_type text,p_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text := public.copilot_owner(p_actor); row_data jsonb; fields jsonb;
begin
  if p_type='update_item' then
    select to_jsonb(i) into row_data from public.items i where i.id::text=p_id and i."userId"::text=owner_id;
    fields := jsonb_build_object('name',row_data->'name','description',row_data->'description','cuantity',coalesce(nullif(row_data->>'cuantity',''),row_data->>'quantity'),'value',row_data->>'value','tags',row_data->'tags');
  elsif p_type='update_bin' then
    select to_jsonb(b) into row_data from public.bins b where b.id::text=p_id and b."userId"::text=owner_id;
    fields := jsonb_build_object('name',row_data->'name','description',row_data->'description');
  elsif p_type='update_location' then
    select to_jsonb(l) into row_data from public.locations l where l.id::text=p_id and l."userId"::text=owner_id;
    fields := jsonb_build_object('name',row_data->'name','description',row_data->'description','address',row_data->'address');
  else raise exception 'COPILOT_INVALID'; end if;
  if row_data is null then raise exception 'COPILOT_NOT_FOUND'; end if;
  return jsonb_build_object('version',md5(row_data::text),'fields',fields,'name',row_data->>'name','binId',row_data->>'binId');
end $$;
revoke all on function public.copilot_prepare_edit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.copilot_prepare_edit(uuid,text,text) to service_role;

create or replace function public.copilot_execute(
  p_actor uuid, p_request_id text, p_type text, p_data jsonb, p_limits jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare owner_id text := public.copilot_owner(p_actor); b public.bins%rowtype; l public.locations%rowtype;
  i public.items%rowtype; result jsonb; old_op public.copilot_operations%rowtype;
  item_limit integer := (p_limits->>'items')::integer; bin_limit integer := (p_limits->>'bins')::integer;
  location_limit integer := (p_limits->>'locations')::integer;
  request jsonb := jsonb_build_object('type', p_type, 'data', p_data);
  loc jsonb := null; snapshot jsonb; patch jsonb; allowed text[]; key text;
begin
  if p_request_id !~ '^[A-Za-z0-9_-]{8,120}$' or item_limit is null or bin_limit is null or location_limit is null then raise exception 'COPILOT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('copilot-write:' || owner_id, 0));
  select * into old_op from public.copilot_operations where actor = p_actor and request_id = p_request_id;
  if found then
    if old_op.request <> request then raise exception 'COPILOT_REQUEST_CHANGED'; end if;
    return old_op.result;
  end if;
  if p_type in ('update_item','update_bin','update_location') then
    -- Lock the actual owned row before comparing the server-issued snapshot.
    if p_type = 'update_item' then
      select * into i from public.items where id::text=p_data->>'itemId' and "userId"::text=owner_id for update;
      if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
      snapshot := to_jsonb(i); allowed := array['name','description','cuantity','value','tags'];
    elsif p_type = 'update_bin' then
      select * into b from public.bins where id::text=p_data->>'binId' and "userId"::text=owner_id for update;
      if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
      snapshot := to_jsonb(b); allowed := array['name','description'];
    else
      select * into l from public.locations where id::text=p_data->>'locationId' and "userId"::text=owner_id for update;
      if not found then raise exception 'COPILOT_NOT_FOUND'; end if;
      snapshot := to_jsonb(l); allowed := array['name','description','address'];
    end if;
    if p_data->>'expectedVersion' is null or p_data->>'expectedVersion' <> md5(snapshot::text) then raise exception 'COPILOT_STALE_RECORD'; end if;
    if exists(select 1 from jsonb_object_keys(p_data) k where k <> all(allowed || array['itemId','binId','locationId','expectedVersion'])) then raise exception 'COPILOT_INVALID'; end if;
    patch := p_data - array['itemId','binId','locationId','expectedVersion','before','targetName'];
    if p_type <> 'update_item' then patch := patch - array['cuantity','value','tags']; end if;
    if p_type <> 'update_location' then patch := patch - array['address']; end if;
    if p_type <> 'update_item' or not (patch ? 'name') then null; end if;
    if patch ? 'name' then
      if jsonb_typeof(patch->'name') <> 'string' or length(trim(patch->>'name')) not between 1 and 200 then raise exception 'COPILOT_INVALID'; end if;
      patch := jsonb_set(patch,'{name}',to_jsonb(trim(patch->>'name')));
    end if;
    if patch ? 'description' then
      if jsonb_typeof(patch->'description') <> 'string' or length(patch->>'description') > 2000 then raise exception 'COPILOT_INVALID'; end if;
      patch := jsonb_set(patch,'{description}',to_jsonb(trim(patch->>'description')));
    end if;
    if patch ? 'address' then
      if jsonb_typeof(patch->'address') <> 'string' or length(patch->>'address') > 500 then raise exception 'COPILOT_INVALID'; end if;
      patch := jsonb_set(patch,'{address}',to_jsonb(trim(patch->>'address')));
    end if;
    if patch ? 'cuantity' then
      if not (patch->>'cuantity' ~ '^[0-9]{1,12}(\.[0-9]{1,4})?$') or public.copilot_number(patch->>'cuantity') is null or public.copilot_number(patch->>'cuantity') <= 0 then raise exception 'COPILOT_INVALID'; end if;
      patch := jsonb_set(patch,'{cuantity}',to_jsonb(public.copilot_number(patch->>'cuantity')));
      patch := patch || jsonb_build_object('quantity',public.copilot_number(patch->>'cuantity'));
    end if;
    if patch ? 'value' then
      if not (patch->>'value' ~ '^[0-9]{1,12}(\.[0-9]{1,4})?$') or public.copilot_number(patch->>'value') is null then raise exception 'COPILOT_INVALID'; end if;
      patch := jsonb_set(patch,'{value}',to_jsonb(public.copilot_number(patch->>'value')));
    end if;
    if patch ? 'tags' then
      if jsonb_typeof(patch->'tags') <> 'array' or jsonb_array_length(patch->'tags') > 20 then raise exception 'COPILOT_INVALID'; end if;
      if exists(select 1 from jsonb_array_elements(patch->'tags') t where jsonb_typeof(t) <> 'string' or length(trim(t #>> '{}')) not between 1 and 60) then raise exception 'COPILOT_INVALID'; end if;
    end if;
    if patch='{}'::jsonb then raise exception 'COPILOT_INVALID'; end if;
    if p_type='update_item' then
      i := jsonb_populate_record(i,patch);
      update public.items set name=i.name,description=i.description,cuantity=i.cuantity,quantity=i.quantity,value=i.value,tags=i.tags where id=i.id and "userId"::text=owner_id;
      result := jsonb_build_object('itemId',i.id::text,'name',i.name);
    elsif p_type='update_bin' then
      b := jsonb_populate_record(b,patch);
      update public.bins set name=b.name,description=b.description where id=b.id and "userId"::text=owner_id;
      result := jsonb_build_object('binId',b.id::text,'name',b.name);
    else
      l := jsonb_populate_record(l,patch);
      update public.locations set name=l.name,address=l.address,description=l.description where id=l.id and "userId"::text=owner_id;
      -- Bins embed a location label. Refresh only this owner's matching references.
      update public.bins set location=location || jsonb_build_object('name',l.name,'address',l.address)
        where "userId"::text=owner_id and location->>'id'=l.id::text;
      result := jsonb_build_object('locationId',l.id::text,'name',l.name);
    end if;
    insert into public.copilot_operations(actor,request_id,request,result) values(p_actor,p_request_id,request,result);
    return result;
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
      'cuantity', p_data->>'cuantity', 'quantity', public.copilot_number(p_data->>'cuantity'), 'value', public.copilot_number(p_data->>'value'), 'tags', coalesce(p_data->'tags','[]'::jsonb), 'binId', b.id, 'userId', owner_id, 'createdAt', now()));
    insert into public.items(id, name, description, cuantity, quantity, value, tags, "binId", "userId", "createdAt")
      values(i.id,i.name,i.description,i.cuantity,i.quantity,i.value,i.tags,i."binId",i."userId",i."createdAt") returning * into i;
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

revoke all on function public.copilot_execute(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.copilot_execute(uuid,text,text,jsonb,jsonb) to service_role;
commit;
