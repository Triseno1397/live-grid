-- Live Grid — Phase 1 search indexes
--
-- The init migration enabled pg_trgm and deliberately created no search objects, leaving
-- that to Phase 1. This is that work: the indexes behind the Cmd-K palette.
--
-- Deliberately indexes ONLY — no tsvector column, no search RPC. The palette queries
-- through PostgREST using the `fts` and `ilike` operators, which means search is correct
-- whether or not this migration has been applied; applying it only makes it fast. That
-- property matters because the seed is still growing: nothing breaks in the window between
-- deploying the UI and pushing the migration.
--
-- The expressions below must match what PostgREST generates, or the planner will ignore
-- the index and fall back to a sequential scan:
--   ?name=fts(english).grammy   ->  to_tsvector('english', name) @@ to_tsquery('english', ...)
--   ?name=ilike.*grammy*        ->  name ilike '%grammy%'
--
-- pg_trgm lives in the `extensions` schema (see 20260806000000_init.sql), so its operator
-- class is qualified.

-- ---------------------------------------------------------------------------
-- Full text — productions carry the prose worth ranking
-- ---------------------------------------------------------------------------
create index if not exists productions_name_fts_idx
  on public.productions using gin (to_tsvector('english', name));

create index if not exists productions_description_fts_idx
  on public.productions using gin (to_tsvector('english', coalesce(description, '')));

-- ---------------------------------------------------------------------------
-- Trigram — carries the misspellings and partial words FTS refuses to match.
-- "grammys" finds "Grammy Awards"; "dolby thea" finds "Dolby Theatre".
-- ---------------------------------------------------------------------------
create index if not exists productions_name_trgm_idx
  on public.productions using gin (name extensions.gin_trgm_ops);

create index if not exists venues_name_trgm_idx
  on public.venues using gin (name extensions.gin_trgm_ops);

create index if not exists cities_name_trgm_idx
  on public.cities using gin (name extensions.gin_trgm_ops);

create index if not exists networks_name_trgm_idx
  on public.networks using gin (name extensions.gin_trgm_ops);

create index if not exists companies_name_trgm_idx
  on public.companies using gin (name extensions.gin_trgm_ops);
