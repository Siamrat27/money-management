-- PocketFlow Database Schema
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run

-- ── accounts ────────────────────────────────────────────────────────────────
create table public.accounts (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  type        text not null check (type in ('cash','bank','savings','other')),
  color       text not null default '#6366f1',
  icon        text not null default '💵',
  created_at  timestamptz not null default now()
);

-- ── tags ────────────────────────────────────────────────────────────────────
create table public.tags (
  id             text primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  name           text not null,
  color          text not null default '#6366f1',
  icon           text not null default '🏷️',
  type           text not null check (type in ('income','expense','both')),
  monthly_budget numeric default null
);

-- ── transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  type          text not null check (type in ('income','expense','transfer')),
  amount        numeric(15,2) not null check (amount > 0),
  account_id    text references public.accounts(id) on delete cascade not null,
  to_account_id text references public.accounts(id) on delete set null,
  tag_id        text references public.tags(id) on delete set null,
  note          text not null default '',
  date          timestamptz not null,
  is_recurring  boolean not null default false,
  recurring_id  text
);

-- ── recurring ────────────────────────────────────────────────────────────────
create table public.recurring (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  type          text not null check (type in ('income','expense')),
  amount        numeric(15,2) not null check (amount > 0),
  account_id    text references public.accounts(id) on delete cascade not null,
  tag_id        text references public.tags(id) on delete set null,
  frequency     text not null check (frequency in ('daily','weekly','monthly','yearly')),
  start_date    timestamptz not null,
  end_date      timestamptz,
  next_due_date timestamptz not null,
  is_active     boolean not null default true
);

-- ── user_settings ────────────────────────────────────────────────────────────
create table public.user_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  discord_webhook  text default null
);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.accounts      enable row level security;
alter table public.tags          enable row level security;
alter table public.transactions  enable row level security;
alter table public.recurring     enable row level security;
alter table public.user_settings enable row level security;

-- Each user can only see/modify their own rows
create policy "own accounts"      on public.accounts      for all using (auth.uid() = user_id);
create policy "own tags"          on public.tags          for all using (auth.uid() = user_id);
create policy "own transactions"  on public.transactions  for all using (auth.uid() = user_id);
create policy "own recurring"     on public.recurring     for all using (auth.uid() = user_id);
create policy "own user_settings" on public.user_settings for all using (auth.uid() = user_id);

-- ── Indexes for common query patterns ───────────────────────────────────────
create index on public.transactions (user_id, date desc);
create index on public.transactions (user_id, account_id);
create index on public.recurring    (user_id, is_active, next_due_date);
