-- READ ONLY: run in the Supabase SQL editor before applying the migration.
-- All data/auth/storage are in Supabase. A migrated owner ID may differ from Auth's UUID.
-- No existing inventory IDs are rewritten by the copilot migration.
begin read only;
select u.id as auth_user_id,
       u.raw_app_meta_data->>'inventory_user_id' as trusted_inventory_owner,
       count(distinct b.id) filter(where b."userId"::text = u.id::text) as bins_using_auth_uuid,
       count(distinct b.id) filter(where b."userId"::text = u.raw_app_meta_data->>'inventory_user_id') as bins_using_trusted_owner
from auth.users u
left join public.bins b on b."userId"::text = u.id::text or b."userId"::text = u.raw_app_meta_data->>'inventory_user_id'
group by u.id, u.raw_app_meta_data->>'inventory_user_id';

-- Owners not yet linked to Auth UUIDs or trusted Supabase app_metadata.
with owners as (
  select 'bins' as source, "userId"::text as owner_id from public.bins
  union all select 'items', "userId"::text from public.items
  union all select 'locations', "userId"::text from public.locations
  union all select 'subscriptions', "userId"::text from public.subscriptions
)
select source, owner_id as unmapped_inventory_owner, count(*) as records
from owners o
where not exists (select 1 from auth.users u where o.owner_id = u.id::text or o.owner_id = u.raw_app_meta_data->>'inventory_user_id')
group by source, owner_id;

select table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and table_name in ('bins','items','locations','subscriptions','copilot_chats')
order by table_name, ordinal_position;
rollback;

-- AFTER verification, only if an owner mapping is necessary, an administrator can run:
-- insert into public.copilot_accounts(auth_user_id, inventory_user_id)
-- values ('VERIFIED_SUPABASE_AUTH_UUID', 'VERIFIED_INVENTORY_OWNER_ID');
-- The migration's trigger copies the verified mapping into Supabase app_metadata.
-- Refresh the user's Auth session afterwards. Never copy editable user_metadata as proof of identity.
-- If all userId columns already use Auth UUIDs, no mapping is needed.
--
-- Deployment, after reviewing/applying migrations/202610240001_boxbin_copilot.sql:
-- supabase secrets set --env-file /path/to/private/server.env --project-ref YOUR_PROJECT_REF
-- supabase functions deploy boxbin-copilot --project-ref YOUR_PROJECT_REF
-- supabase functions deploy boxbin-image --project-ref YOUR_PROJECT_REF
-- Keep gateway JWT verification enabled for boxbin-copilot and boxbin-image.
-- For Gemini Live: see copilot-voice-setup.txt; only boxbin-copilot-voice uses
-- verify_jwt=false with explicit Auth validation before upgrading the WebSocket.
-- Rotate the previously exposed Gemini key in Google Cloud; deleting it from code cannot revoke it.
