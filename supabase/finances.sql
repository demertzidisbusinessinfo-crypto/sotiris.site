-- Finances tab (admin only).
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Three tables:
--   finance_categories  your expense buckets, each tagged business or personal
--   finance_entries     every euro in and out
--   finance_settings    display currency + the EUR/USD rate you set
--
-- Everything is scoped to the logged-in user by RLS, so only you can read or
-- write your own rows even though the anon key is public.

-- ---------------------------------------------------------------- categories

create table if not exists public.finance_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- business costs come off revenue before profit; personal comes out of what
  -- is already profit. Keeping them apart is the whole point of the split.
  kind        text not null default 'business' check (kind in ('business', 'personal')),
  sort_order  integer not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists finance_categories_user_idx
  on public.finance_categories (user_id, sort_order);

-- ------------------------------------------------------------------ entries

create table if not exists public.finance_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  direction    text not null check (direction in ('in', 'out')),
  amount       numeric(12, 2) not null check (amount >= 0),
  currency     text not null default 'EUR' check (currency in ('EUR', 'USD')),
  category_id  uuid references public.finance_categories(id) on delete set null,
  note         text,
  entry_date   date not null,
  -- A recurring entry is a template: it repeats on the same day every month
  -- from entry_date until recurring_until (or forever while null). The repeats
  -- are worked out in the browser, so there is no cron job to keep alive.
  recurring       boolean not null default false,
  recurring_until date,
  created_at   timestamptz not null default now()
);

create index if not exists finance_entries_user_date_idx
  on public.finance_entries (user_id, entry_date);

-- ----------------------------------------------------------------- settings

create table if not exists public.finance_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_currency text not null default 'EUR' check (display_currency in ('EUR', 'USD')),
  -- How many dollars one euro buys. Used to show mixed entries in one currency.
  eur_usd_rate     numeric(10, 4) not null default 1.0800 check (eur_usd_rate > 0),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------- RLS

alter table public.finance_categories enable row level security;
alter table public.finance_entries    enable row level security;
alter table public.finance_settings   enable row level security;

drop policy if exists "own categories" on public.finance_categories;
create policy "own categories" on public.finance_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own entries" on public.finance_entries;
create policy "own entries" on public.finance_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.finance_settings;
create policy "own settings" on public.finance_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
