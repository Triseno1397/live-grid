-- Live Grid — initial schema
-- Source of truth: LIVEGRID_PLAN.md "Database Schema (Phase 0)".
-- Any change to this schema requires a new migration file AND an update to the plan doc
-- (AGENTS.md rule 2: "schema is law").
--
-- Create order is FK-driven:
--   cities -> venues -> networks -> companies -> productions -> editions -> viewership
--   -> profiles -> favorites

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- pg_trgm backs the Phase 1 fuzzy search (locked stack: "Postgres full-text + pg_trgm").
-- Enabled now because it is zero-cost foundation; NO search indexes or functions are
-- created here — that is Phase 1 work.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------

-- lat/lng present from day one so the Phase 3 map needs no backfill.
create table public.cities (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  slug      text not null unique,
  state     text,
  country   text not null default 'USA',
  timezone  text,
  lat       numeric(9,6),
  lng       numeric(9,6)
);

create table public.networks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  logo_url     text,
  is_streaming boolean not null default false,
  website      text
);

create table public.companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  logo_url     text,
  headquarters text,
  website      text
);

create table public.venues (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  slug     text not null unique,
  address  text,
  city_id  uuid references public.cities(id) on delete set null,
  capacity integer check (capacity is null or capacity > 0),
  website  text
);

-- ---------------------------------------------------------------------------
-- Core content
-- ---------------------------------------------------------------------------

-- The evergreen entity: "Grammy Awards" exists once, regardless of year.
create table public.productions (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  category              text not null check (category in (
                          'awards','sports','concerts','game_shows','reality','streaming',
                          'holiday','tech','gaming','corporate','political','international'
                        )),
  subcategory           text,
  network_id            uuid references public.networks(id) on delete set null,
  production_company_id uuid references public.companies(id) on delete set null,
  typical_month         integer check (typical_month between 1 and 12),
  recurring             boolean not null default true,
  production_scale      integer check (production_scale between 1 and 5),
  description           text,
  logo_url              text,
  hero_image_url        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Each year's instance: "Grammy Awards 2027, Feb 1, Crypto.com Arena".
-- The unique (production_id, year) constraint is what makes /admin/import idempotent —
-- re-pasting a seed batch updates rows instead of duplicating them.
create table public.editions (
  id              uuid primary key default gen_random_uuid(),
  production_id   uuid not null references public.productions(id) on delete cascade,
  year            integer not null check (year between 1900 and 2200),
  start_date      date,
  end_date        date,
  venue_id        uuid references public.venues(id) on delete set null,
  city_id         uuid references public.cities(id) on delete set null,
  status          text not null default 'rumored' check (status in (
                    'confirmed','rumored','announced','completed','cancelled'
                  )),
  -- Event timeline, all nullable — populated only when a schedule is actually known.
  load_in          date,
  tech_rehearsal   date,
  dress_rehearsal  date,
  show_date        date,
  strike           date,
  constraint editions_production_year_key unique (production_id, year),
  constraint editions_date_order_check check (end_date is null or start_date is null or end_date >= start_date)
);

-- One row per production per year -> trend graphs for free.
create table public.viewership (
  id               uuid primary key default gen_random_uuid(),
  production_id    uuid not null references public.productions(id) on delete cascade,
  year             integer not null check (year between 1900 and 2200),
  average_viewers  numeric check (average_viewers is null or average_viewers >= 0),
  peak_viewers     numeric check (peak_viewers is null or peak_viewers >= 0),
  constraint viewership_production_year_key unique (production_id, year)
);

-- ---------------------------------------------------------------------------
-- Commercial-ready scaffolding — empty at launch, zero cost to have.
-- NOTE: the auth.users -> profiles trigger is deliberately NOT created here.
-- Accounts are Phase 2 (AGENTS.md rule 4: stay in phase).
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'user' check (role in ('user','editor','admin')),
  created_at   timestamptz not null default now()
);

create table public.favorites (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, production_id)
);

-- ---------------------------------------------------------------------------
-- Indexes — shaped for the Phase 1 query patterns
-- ---------------------------------------------------------------------------
create index editions_start_date_idx    on public.editions (start_date);
create index editions_city_id_idx       on public.editions (city_id);
create index editions_venue_id_idx      on public.editions (venue_id);
create index editions_production_id_idx on public.editions (production_id);
create index editions_status_idx        on public.editions (status);
create index productions_category_idx   on public.productions (category);
create index productions_network_id_idx on public.productions (network_id);
create index productions_company_id_idx on public.productions (production_company_id);
create index venues_city_id_idx         on public.venues (city_id);
create index viewership_production_id_idx on public.viewership (production_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger productions_set_updated_at
  before update on public.productions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required: without it, a policy on public.profiles that calls this
-- function would re-enter public.profiles' own RLS policy and recurse.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('editor','admin')
  );
$$;

revoke execute on function public.is_editor() from public;
grant execute on function public.is_editor() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled on every table, no exceptions (AGENTS.md rule 5).
-- Content tables: world-readable, editor/admin-writable.
-- The service_role key used by /admin/import bypasses RLS entirely by design.
-- ---------------------------------------------------------------------------
alter table public.cities      enable row level security;
alter table public.networks    enable row level security;
alter table public.companies   enable row level security;
alter table public.venues      enable row level security;
alter table public.productions enable row level security;
alter table public.editions    enable row level security;
alter table public.viewership  enable row level security;
alter table public.profiles    enable row level security;
alter table public.favorites   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cities','networks','companies','venues','productions','editions','viewership'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_select_public', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_editor())',
      t || '_insert_editor', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())',
      t || '_update_editor', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_editor())',
      t || '_delete_editor', t);
  end loop;
end;
$$;

-- profiles: read/update your own row; admins see and manage everything.
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id or public.is_editor());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
-- Role escalation is intentionally impossible here: promoting a user to editor/admin is a
-- service_role operation (the admin panel in Phase 2), never a self-service update.
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- favorites: strictly your own.
create policy favorites_select_own on public.favorites
  for select to authenticated using ((select auth.uid()) = user_id);
create policy favorites_insert_own on public.favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy favorites_delete_own on public.favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants (explicit; RLS still governs row visibility)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on
  public.cities, public.networks, public.companies, public.venues,
  public.productions, public.editions, public.viewership
  to anon, authenticated;

grant insert, update, delete on
  public.cities, public.networks, public.companies, public.venues,
  public.productions, public.editions, public.viewership
  to authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
