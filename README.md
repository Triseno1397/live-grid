# Live Grid

The searchable operating system for live broadcast production — every award show, sports
broadcast, live concert, game show taping, and streaming special, searchable by city,
network, producer, month, and scale.

`LIVEGRID_PLAN.md` is the roadmap and source of truth for scope, schema, and phase order.
`AGENTS.md` holds the rules every build session follows. Read both before changing anything.

**Current state: Phase 1 is built, and the seed is the remaining work.** The public product
is live — dashboard, calendar, browse table, production/city/network/company pages, and the
⌘K search — and every page reads the real database. What gates the ship is data volume, not
code. `seeds/PROGRESS.md` is the durable ledger for that sweep; `/admin` shows it live.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
```

`.env.local` needs the Supabase project URL, the publishable/anon key, the secret/service_role
key, and an `ADMIN_IMPORT_TOKEN` you generate yourself:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database

The schema lives in `supabase/migrations/` and is the only place it may change — no ad-hoc
columns via the dashboard. A schema change means a new migration file plus an update to
`LIVEGRID_PLAN.md`.

This machine has no Docker, so there is no local Supabase stack; the CLI is pointed at the
hosted project instead.

```bash
npx supabase login                          # or set SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref <ref>
npm run db:push                             # apply migrations to the hosted database
npm run db:types                            # regenerate src/lib/supabase/database.types.ts
```

`src/lib/supabase/database.types.ts` is generated. Never hand-edit it.

## Seeding

Research a batch into `seeds/NNN-slice.json`, then run the gates in order:

```bash
npm run seeds:lookups                     # BEFORE writing: the names already in the database
npm run seeds:check                       # shape, dates, provenance, forks (--strict while authoring)
npm run seeds:links -- --file 'NNN-*'     # do the cited pages actually exist?
npm run seeds:import -- seeds/NNN-*.json --verify
```

`--verify` imports the batch twice and fails unless the second pass created nothing, left
`createdLookups` empty and derived an identical confidence tally. `seeds:links` is the only
gate that cannot be reasoned about from the file, and it is the one that catches a citation
nobody ever read.

Two more, for after a correction:

```bash
npm run seeds:prune      # sources cited by no seed file (dry; --apply deletes)
npm run seeds:rederive   # recompute stored confidence from stored citations
```

And two that fetch rather than check:

```bash
npm run discover -- --category concerts   # Wikidata -> seeds/candidates/*.json (leads, not records)
npm run enrich -- venues                  # fills nulls only: capacity, website
```

`/admin/import` still accepts a pasted JSON array and is the browser fallback. Both paths call
the same `runImport`, so there is one write path and the route stays a thin wrapper.

Every write is keyed on a stable slug (productions, cities, networks, companies, venues) or
on `(production_id, year)` (editions, viewership). Re-pasting a batch therefore updates
rather than duplicates, which makes a failed import safe to simply retry.

The accepted shape is defined in `src/lib/import/schema.ts`. Two conveniences:

- Lookups take a bare string or a full object: `"network": "CBS"` or
  `"network": { "name": "CBS", "is_streaming": false }`.
- A single upcoming edition can be written flat on the production (`year`, `status`, `city`,
  `venue`, `start_date`, `end_date`) instead of nested under `editions`.

Objects are strict — an unrecognized key fails that record instead of being silently
dropped, so a typo surfaces immediately. Failures are per-record: one bad entry is reported
in `errors[]` and the rest of the batch still imports.

Newly created lookup rows are listed back in `createdLookups`. Read that field on every
import: it is how `CBS` vs `CBS Sports` gets caught before it forks into two rows.

Anything not confirmed gets `"status": "rumored"`. Never invent a date to fill a field.

**`confidence` is derived, never written.** The importer recomputes it from the citations that
actually landed, and the input schema has no `confidence` key — a batch that tries to assert
one fails validation. Corroboration counts registrable domains rather than publisher labels,
because "Deadline" and "Deadline Hollywood" are one outlet and two strings. A `reference`-tier
source alone can never exceed `single_source`, however many of them there are.

## Stack

Next.js 15 App Router · TypeScript strict · Tailwind CSS 4 · shadcn/ui · Supabase
(Postgres + RLS) · Postgres full-text + pg_trgm · zod.

Locked — see `AGENTS.md`. No Prisma, no Meilisearch, no FullCalendar.
