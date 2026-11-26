-- Sales list fields on items: allows listing items from any bin for sale on eBay/Amazon/etc. and tracking sold status.
alter table public.items
  add column if not exists sale_status text not null default 'not_for_sale',
  add column if not exists sale_price text,
  add column if not exists sale_url text,
  add column if not exists sold_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_sale_status_check'
  ) then
    alter table public.items
      add constraint items_sale_status_check
      check (sale_status in ('not_for_sale', 'for_sale', 'sold'));
  end if;
end $$;

create index if not exists items_user_sale_status_idx
  on public.items ("userId", sale_status)
  where sale_status in ('for_sale', 'sold');

notify pgrst, 'reload schema';
