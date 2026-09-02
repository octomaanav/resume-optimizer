-- migration: 20260409120000_profiles_skill_categories
-- Adds skill_categories column (labeled skill groups, e.g. Technical vs Soft).

alter table public.profiles
  add column if not exists skill_categories jsonb not null default '[]'::jsonb;
