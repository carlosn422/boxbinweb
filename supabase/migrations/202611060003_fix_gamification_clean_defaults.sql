-- Migration: 202611060003_fix_gamification_clean_defaults.sql
-- Description: Fix user_gamification table defaults to be completely clean (0 acorns, empty room progress, empty badges)
begin;

alter table if exists public.user_gamification
  alter column acorns set default 0,
  alter column "roomProgress" set default '{}'::jsonb,
  alter column badges set default '[]'::jsonb;

-- Also reset any rows that only have the default mock data:
update public.user_gamification
set
  acorns = 0,
  "completedMissions" = 0,
  "itemsStoredCount" = 0,
  "binsScannedCount" = 0,
  "roomProgress" = '{}'::jsonb,
  badges = '[]'::jsonb,
  "updatedAt" = now()
where
  acorns = 45
  and ("roomProgress"->>'Garage' = '60' or "roomProgress" = '{"Garage": 60, "Attic": 35, "Closet": 20}'::jsonb);

commit;

