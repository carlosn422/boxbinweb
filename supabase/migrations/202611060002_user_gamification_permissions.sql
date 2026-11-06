-- Migration: 202611060002_user_gamification_permissions.sql
-- Description: Grant select, insert, update to anon and authenticated with RLS policy protection
begin;

grant select, insert, update, delete on public.user_gamification to anon, authenticated;

commit;

