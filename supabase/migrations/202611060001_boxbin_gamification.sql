-- Migration: 202611060001_boxbin_gamification.sql
-- Description: BoxBin Quest Gamification & Rewards table with RLS security
begin;

create table if not exists public.user_gamification (
  "userId" text primary key,
  acorns integer not null default 45,
  "completedMissions" integer not null default 0,
  "itemsStoredCount" integer not null default 0,
  "binsScannedCount" integer not null default 0,
  "roomProgress" jsonb not null default '{"Garage": 60, "Attic": 35, "Closet": 20}'::jsonb,
  badges jsonb not null default '["first-mission"]'::jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Enable RLS
alter table public.user_gamification enable row level security;

-- Revoke anon access, grant authenticated and service_role
revoke all on public.user_gamification from anon;
grant select, insert, update, delete on public.user_gamification to authenticated;
grant all on public.user_gamification to service_role;

-- RLS Policy: Users can only read and write their own gamification record
drop policy if exists gamification_own_data on public.user_gamification;
create policy gamification_own_data on public.user_gamification for all to authenticated
using ("userId"::text = auth.uid()::text or "userId"::text = (auth.jwt() ->> 'sub'))
with check ("userId"::text = auth.uid()::text or "userId"::text = (auth.jwt() ->> 'sub'));

commit;

