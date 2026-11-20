-- Optional source-backed marketplace references; inventory value remains user controlled.
alter table public.items add column if not exists market_research jsonb;
comment on column public.items.market_research is
  'Photo AI marketplace research: US/USD asking prices, source URLs, condition and lookup date. Not an appraisal.';
notify pgrst, 'reload schema';
