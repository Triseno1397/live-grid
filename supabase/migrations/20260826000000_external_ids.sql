-- Live Grid — stable identifiers for entities that came from, or can be re-checked against,
-- an outside dataset.
--
-- The enrichment scripts fill columns that seeding leaves null: cities.lat/lng, venue
-- capacity and address, network and company logos. All of that is matched by NAME the first
-- time, because a name is all a fresh row has. Matching by name a SECOND time is where it
-- goes wrong — "Los Angeles" is a city in California and one in Chile, half a dozen arenas
-- have been renamed since their venue row was written, and an enricher that re-matches from
-- scratch on every run will eventually pick a different answer and overwrite a good value
-- with a plausible one.
--
-- Recording the identifier the first match resolved to makes the second run a lookup rather
-- than a guess. It is the same argument as `slug`: an identity that survives a rename.
--
-- Shape follows `citations` deliberately — nullable typed FKs plus a check that exactly one
-- is set, rather than a (subject_type, subject_id) pair. The pair cannot be a foreign key, so
-- a deleted venue would strand its identifiers; this keeps referential integrity and lets
-- `on delete cascade` clean up.
--
-- What this is NOT: an import key. `productions.slug` remains the only thing the importer
-- matches on, and nothing in `src/lib/import/` reads this table. Enrichers write it and
-- enrichers read it. Saying so here is what stops the next session turning it into a second
-- write path.

create table public.external_ids (
  id           uuid primary key default gen_random_uuid(),

  -- Checked rather than free text, so adding a second identifier system is a migration —
  -- the same friction CATEGORIES and TEAM_ROLES get, for the same reason.
  source       text not null check (source in ('wikidata')),
  -- Verbatim, as the upstream writes it: 'Q60', not 60.
  external_id  text not null,

  production_id uuid references public.productions(id) on delete cascade,
  city_id       uuid references public.cities(id)      on delete cascade,
  venue_id      uuid references public.venues(id)      on delete cascade,
  network_id    uuid references public.networks(id)    on delete cascade,
  company_id    uuid references public.companies(id)   on delete cascade,

  -- When the match was made. An identifier does not rot, but the claim "this row is that
  -- entity" was a judgement someone made on a date, and that is worth knowing.
  retrieved_on date not null,
  created_at   timestamptz not null default now(),

  constraint external_ids_one_subject
    check (num_nonnulls(production_id, city_id, venue_id, network_id, company_id) = 1),

  -- One identifier per subject per system. Four of the five subject columns are null on every
  -- row, so NULLS NOT DISTINCT is load-bearing: under the default, every re-run would insert
  -- a duplicate instead of matching, which is precisely the failure this table exists to stop.
  constraint external_ids_subject_unique unique nulls not distinct
    (source, production_id, city_id, venue_id, network_id, company_id),

  -- And one subject per identifier. Two cities both claiming Q60 is the fork the table
  -- exists to make impossible; both columns are NOT NULL so no NULLS clause is needed.
  constraint external_ids_identity_unique unique (source, external_id)
);

-- No edition_id, deliberately. An edition is already keyed on (production_id, year) and a
-- per-year identifier buys nothing unless a recurring re-check job exists to use it. Add it
-- with that job, not before. No production_team either — a free-text person name has no
-- external identity worth pinning.

create index external_ids_production_id_idx on public.external_ids (production_id);
create index external_ids_city_id_idx       on public.external_ids (city_id);
create index external_ids_venue_id_idx      on public.external_ids (venue_id);
create index external_ids_network_id_idx    on public.external_ids (network_id);
create index external_ids_company_id_idx    on public.external_ids (company_id);

comment on table public.external_ids is
  'Upstream identifiers for enrichment re-runs. Not an import key — productions.slug is.';

-- ---------------------------------------------------------------------------
-- RLS — same shape as every other content table (AGENTS.md rule 5).
-- ---------------------------------------------------------------------------
alter table public.external_ids enable row level security;

create policy external_ids_select_public on public.external_ids
  for select to anon, authenticated using (true);
create policy external_ids_insert_editor on public.external_ids
  for insert to authenticated with check (public.is_editor());
create policy external_ids_update_editor on public.external_ids
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy external_ids_delete_editor on public.external_ids
  for delete to authenticated using (public.is_editor());

grant select on public.external_ids to anon, authenticated;
grant insert, update, delete on public.external_ids to authenticated;
