begin;

-- Per-user customizable AI assistant name (defaults to 'Boxbin').
create table if not exists public.copilot_preferences (
  actor uuid primary key references auth.users(id) on delete cascade,
  assistant_name text not null default 'Boxbin' check (length(trim(assistant_name)) between 1 and 40),
  updated_at timestamptz not null default now()
);

alter table public.copilot_preferences enable row level security;
revoke all on public.copilot_preferences from anon, authenticated;
grant select on public.copilot_preferences to authenticated;
grant all on public.copilot_preferences to service_role;

drop policy if exists copilot_own_preferences on public.copilot_preferences;
create policy copilot_own_preferences on public.copilot_preferences for select to authenticated
using (actor = auth.uid());

create or replace function public.copilot_get_assistant_name(p_actor uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_name text;
begin
  if p_actor is null then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  select assistant_name into v_name
  from public.copilot_preferences
  where actor = p_actor;
  return coalesce(nullif(trim(v_name), ''), 'Boxbin');
end $$;

create or replace function public.copilot_set_assistant_name(p_actor uuid, p_name text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_clean text;
begin
  if p_actor is null then raise exception 'COPILOT_UNAUTHORIZED'; end if;
  v_clean := trim(regexp_replace(coalesce(p_name, ''), E'[\\r\\n\\t]+', ' ', 'g'));
  v_clean := regexp_replace(v_clean, '\s{2,}', ' ', 'g');
  if length(v_clean) < 1 or length(v_clean) > 40 then
    raise exception 'COPILOT_INVALID';
  end if;

  insert into public.copilot_preferences(actor, assistant_name, updated_at)
  values (p_actor, v_clean, now())
  on conflict (actor) do update set
    assistant_name = excluded.assistant_name,
    updated_at = excluded.updated_at;

  return v_clean;
end $$;

do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace = 'public'::regnamespace and proname like 'copilot_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

commit;
