-- Live Grid — production team and vendors, per edition
--
-- The schema could say WHERE a show happens across years but not WHO makes it. There was
-- exactly one productions.production_company_id: no per-year history, no way to name a
-- person, no way to record a supplier. A show that changes production company between years
-- was invisible — the same blind spot venue history had before the edition table earned
-- its keep.
--
-- Deliberately NOT a credits system. No people table, no filmographies, no below-the-line
-- department heads. This answers one question a working freelancer actually asks after
-- "what's filming in Atlanta next month?" — namely "who's running it?"
--
-- One table for both people and companies: a vendor is a company and an EP is a person, but
-- they answer the same question, and splitting them would duplicate the role, ordering and
-- per-edition logic twice over. person_name is free text rather than a foreign key because
-- there are no person pages; promoting it to a table later is a small migration.

create table public.production_team (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  -- Null means "applies to the production generally" rather than to one year.
  edition_id    uuid references public.editions(id) on delete cascade,
  role          text not null check (role in (
                  'production_company','executive_producer','director',
                  'lighting','audio','video','staging'
                )),
  company_id    uuid references public.companies(id) on delete set null,
  person_name   text,
  note          text,
  sort_order    integer not null default 0,

  -- A row that names neither a company nor a person is not a credit, it is a blank.
  constraint production_team_has_subject
    check (company_id is not null or person_name is not null),

  -- NULLS NOT DISTINCT (PG15+; this project runs PG17) is what makes /admin/import
  -- idempotent here. edition_id and company_id are null on a large share of rows, and under
  -- the default NULLS DISTINCT every re-paste of a batch would insert duplicates rather
  -- than match the existing row.
  constraint production_team_unique
    unique nulls not distinct (production_id, edition_id, role, company_id, person_name)
);

create index production_team_production_id_idx on public.production_team (production_id);
create index production_team_edition_id_idx    on public.production_team (edition_id);
create index production_team_company_id_idx    on public.production_team (company_id);

-- ---------------------------------------------------------------------------
-- RLS — same shape as every other content table (AGENTS.md rule 5).
-- ---------------------------------------------------------------------------
alter table public.production_team enable row level security;

create policy production_team_select_public on public.production_team
  for select to anon, authenticated using (true);
create policy production_team_insert_editor on public.production_team
  for insert to authenticated with check (public.is_editor());
create policy production_team_update_editor on public.production_team
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy production_team_delete_editor on public.production_team
  for delete to authenticated using (public.is_editor());

grant select on public.production_team to anon, authenticated;
grant insert, update, delete on public.production_team to authenticated;
