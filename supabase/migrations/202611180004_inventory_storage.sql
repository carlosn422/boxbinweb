begin;
-- Keep the public bucket's existing read behavior. Client writes are limited to
-- their owner namespace; imported objects can also be managed by their uploader.
drop policy if exists inventory_storage_read on storage.objects;
create policy inventory_storage_read on storage.objects for select to authenticated
using(bucket_id='binventory-storage' and (owner_id=auth.uid()::text or (storage.foldername(name))[1]=(select public.inventory_current_owner())));
drop policy if exists inventory_storage_insert on storage.objects;
create policy inventory_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='binventory-storage' and (storage.foldername(name))[1]=(select public.inventory_current_owner()));
drop policy if exists inventory_storage_delete on storage.objects;
create policy inventory_storage_delete on storage.objects for delete to authenticated
using(bucket_id='binventory-storage' and (owner_id=auth.uid()::text or (storage.foldername(name))[1]=(select public.inventory_current_owner())));
commit;
