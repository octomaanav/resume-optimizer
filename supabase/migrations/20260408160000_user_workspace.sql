-- migration: 20260408160000_user_workspace
-- JSON workspace: settings, documents, optimizations (per auth user).

create table if not exists public.user_workspace (
  id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}',
  resumes jsonb not null default '[]',
  cover_letters jsonb not null default '[]',
  application_answer_docs jsonb not null default '[]',
  resume_optimizations jsonb not null default '{}',
  cover_letter_optimizations jsonb not null default '{}',
  application_answer_optimizations jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_workspace enable row level security;

grant select, insert, update on table public.user_workspace to authenticated;

drop policy if exists "user_workspace_select_own" on public.user_workspace;
drop policy if exists "user_workspace_insert_own" on public.user_workspace;
drop policy if exists "user_workspace_update_own" on public.user_workspace;

create policy "user_workspace_select_own"
  on public.user_workspace
  for select
  to authenticated
  using (auth.uid() = id);

create policy "user_workspace_insert_own"
  on public.user_workspace
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "user_workspace_update_own"
  on public.user_workspace
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.user_workspace_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_workspace_set_updated_at on public.user_workspace;
create trigger user_workspace_set_updated_at
  before update on public.user_workspace
  for each row
  execute function public.user_workspace_set_updated_at();
