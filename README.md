# Live Grid

The searchable operating system for live broadcast production — every award show, sports
broadcast, live concert, game show taping, and streaming special, searchable by city,
network, producer, month, and scale.

`LIVEGRID_PLAN.md` is the roadmap and source of truth for scope, schema, and phase order.
`AGENTS.md` holds the rules every build session follows. Read both before changing anything.

**Current state: Phase 0** — schema, RLS, and the internal seeding tool. The public product
(dashboard, calendar, browse table, search) is Phase 1 and is not built yet.

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

`/admin/import` accepts a pasted JSON array of productions and upserts them. It posts to
`POST /api/admin/import`, which is where all the logic lives — the page is only a textarea,
so the Phase 2 admin panel and any scripted importer reuse the same endpoint.

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

## Stack

Next.js 15 App Router · TypeScript strict · Tailwind CSS 4 · shadcn/ui · Supabase
(Postgres + RLS) · Postgres full-text + pg_trgm · zod.

Locked — see `AGENTS.md`. No Prisma, no Meilisearch, no FullCalendar.
