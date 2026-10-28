begin;

-- The inventory still uses the legacy Firebase UID in userId. Import only
-- unambiguous Auth -> legacy mappings from the migrated users table. Accounts
-- with multiple legacy UIDs require an explicit choice and are intentionally
-- left untouched to prevent cross-account inventory leaks.
do $$
begin
  if to_regclass('public.users') is not null then
    insert into public.copilot_accounts(auth_user_id, inventory_user_id)
    select u.auth_user_id, min(u.uid)
    from public.users u
    where u.auth_user_id is not null
      and u.uid is not null
    group by u.auth_user_id
    having count(distinct u.uid) = 1
    on conflict (auth_user_id) do update
      set inventory_user_id = excluded.inventory_user_id
      where public.copilot_accounts.inventory_user_id = excluded.inventory_user_id;
  end if;
end $$;

commit;
