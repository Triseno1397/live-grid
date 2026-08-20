-- Live Grid — provenance and derived confidence
--
-- Six seed batches shipped with their verification recorded in commit messages: "every fact
-- is sourced", "web-verified", "gaps are left as gaps". None of that is in the database. A
-- freelancer looking at a 2027 date has no way to ask where it came from, and neither does
-- the next seeding session — which means every re-check starts from zero.
--
-- Two tables and two columns fix that. `sources` is the citable document, deduped on url so
-- one Deadline story backing eight records is one row. `citations` attaches a source to the
-- exact thing it backs.
--
-- The polymorphic subject is four nullable typed FKs plus a check that exactly one is set,
-- rather than the usual (subject_type, subject_id) pair. The pair cannot be a foreign key,
-- so a deleted edition would leave citations pointing at nothing; this shape keeps real
-- referential integrity and lets `on delete cascade` do the cleanup.
--
-- `confidence` on productions and editions is DERIVED, never asserted. The importer
-- recomputes it from stored citations after writing (see deriveConfidence in importer.ts),
-- so a research batch cannot claim a fact is official-confirmed when its only source is a
-- fan wiki. That gate is the entire point: without it, a confidence column is just another
-- field a hurried session fills in optimistically.

create table public.sources (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  -- The organisation that published it, not the outlet's parent. Used for the
  -- distinct-publisher count that separates "corroborated" from "one story, syndicated".
  publisher    text not null,
  title        text,
  -- official   = the party that decides the fact — network press site, venue calendar,
  --              league schedule, the event's own site.
  -- trade      = Variety, THR, Deadline, Broadcasting+Cable, SBJ, Billboard.
  -- reference  = Wikipedia, aggregators, fan wikis. Never enough on its own.
  tier         text not null check (tier in ('official','trade','reference')),
  published_on date,
  created_at   timestamptz not null default now()
);

create index sources_tier_idx on public.sources (tier);

create table public.citations (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references public.sources(id) on delete cascade,

  production_id uuid references public.productions(id)     on delete cascade,
  edition_id    uuid references public.editions(id)        on delete cascade,
  viewership_id uuid references public.viewership(id)      on delete cascade,
  team_id       uuid references public.production_team(id) on delete cascade,

  -- Which fact this source backs: 'show_date', 'venue', 'network', 'viewership'. Null means
  -- the record generally, which is the honest answer for a profile piece about the show.
  field         text,
  -- When we last read it. A URL that resolved in 2026 may not in 2028, and the answer to
  -- "is this stale?" is this date, not sources.published_on.
  retrieved_on  date not null,

  constraint citations_one_subject
    check (num_nonnulls(production_id, edition_id, viewership_id, team_id) = 1),

  -- Same reasoning as production_team_unique: three of the four subject columns are null on
  -- every row, and `field` is null on many, so the default NULLS DISTINCT would let every
  -- re-paste of a batch insert duplicates instead of matching.
  constraint citations_unique unique nulls not distinct
    (source_id, production_id, edition_id, viewership_id, team_id, field)
);

create index citations_production_id_idx on public.citations (production_id);
create index citations_edition_id_idx    on public.citations (edition_id);
create index citations_viewership_id_idx on public.citations (viewership_id);
create index citations_team_id_idx       on public.citations (team_id);
create index citations_source_id_idx     on public.citations (source_id);

-- ---------------------------------------------------------------------------
-- Derived confidence. Mirrored in CONFIDENCE_LEVELS in src/lib/import/schema.ts.
--
--   official      >=1 official-tier source AND >=2 distinct publishers
--   corroborated  >=2 distinct publishers, at least one not reference-tier
--   single_source  1 source, or several that are all reference-tier
--   unverified     no citations
--
-- Defaulting to 'unverified' rather than null means the existing 57 productions describe
-- themselves accurately the moment this migration lands: sourced in a commit message is not
-- sourced in the database.
-- ---------------------------------------------------------------------------
alter table public.productions
  add column confidence text not null default 'unverified'
    check (confidence in ('unverified','single_source','corroborated','official')),
  add column verified_on date;

alter table public.editions
  add column confidence text not null default 'unverified'
    check (confidence in ('unverified','single_source','corroborated','official')),
  add column verified_on date;

create index productions_confidence_idx on public.productions (confidence);
create index editions_confidence_idx    on public.editions (confidence);

comment on column public.productions.confidence is
  'Derived from citations by the importer. Never write this from a seed payload.';
comment on column public.editions.confidence is
  'Derived from citations by the importer. Never write this from a seed payload.';
comment on column public.productions.verified_on is
  'Latest citations.retrieved_on across this record. Null when unverified.';
comment on column public.editions.verified_on is
  'Latest citations.retrieved_on across this record. Null when unverified.';

-- ---------------------------------------------------------------------------
-- RLS — same shape as every other content table (AGENTS.md rule 5).
-- ---------------------------------------------------------------------------
alter table public.sources   enable row level security;
alter table public.citations enable row level security;

create policy sources_select_public on public.sources
  for select to anon, authenticated using (true);
create policy sources_insert_editor on public.sources
  for insert to authenticated with check (public.is_editor());
create policy sources_update_editor on public.sources
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy sources_delete_editor on public.sources
  for delete to authenticated using (public.is_editor());

create policy citations_select_public on public.citations
  for select to anon, authenticated using (true);
create policy citations_insert_editor on public.citations
  for insert to authenticated with check (public.is_editor());
create policy citations_update_editor on public.citations
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy citations_delete_editor on public.citations
  for delete to authenticated using (public.is_editor());

grant select on public.sources   to anon, authenticated;
grant select on public.citations to anon, authenticated;
grant insert, update, delete on public.sources   to authenticated;
grant insert, update, delete on public.citations to authenticated;
