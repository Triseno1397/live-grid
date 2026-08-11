# LIVE GRID — Build Plan

**Product:** The searchable operating system for live broadcast production. Every award show, sports broadcast, live concert, game show taping, and streaming special — searchable by city, network, producer, month, and scale.

**One-line test:** Someone gets a call — "what's filming in Atlanta next month?" — opens Live Grid, filters Atlanta, and has the answer in 10 seconds.

**Built in:** Google Antigravity, Claude as the build agent. Deployed via GitHub → Vercel.

---

## The Core Strategic Call

**Data is the product. The UI is the delivery mechanism.**

A beautiful dashboard with 12 productions is a demo. A plain table with 300 accurate productions is a tool people bookmark. Phase 0 is therefore data, not code. Do not skip it, do not build features against mock data — every Antigravity session builds against the real seeded database.

Second call: **commercial-ready architecture, invisible at launch.** No paywall, no accounts required at MVP — but the schema, API routes, and auth scaffolding are structured so subscriptions, team accounts, and API access are additive later, not a rewrite.

---

## Stack (Simplified From Vision Doc)

| Layer | MVP Choice | Deferred |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript, Tailwind CSS 4 | — |
| UI | shadcn/ui + Framer Motion | — |
| Database | **Supabase** (Postgres, Auth, Storage, Row Level Security) | Prisma — skip it; use Supabase client + generated types |
| Search | **Postgres full-text + pg_trgm** (instant, free, fine under 5k rows) | Meilisearch (only when latency actually hurts), Algolia |
| Tables | TanStack Table | — |
| Charts | Recharts (viewership trends) | — |
| Calendar | **Custom Tailwind grid** | FullCalendar — cut. It fights Tailwind and never looks Apple-grade |
| Maps | — | Mapbox (Phase 3) |
| AI | — | Claude API assistant (Phase 3) |
| Deploy | Vercel + GitHub Actions | Cloudflare |

Everything cut from MVP is listed above deliberately — nothing from the vision doc is lost, it's sequenced.

---

## Database Schema (Phase 0)

Tightened from the vision doc. Key changes: dates support recurring annual events without hardcoded years, viewership is a related table (per-year rows → trend graphs for free), and `editions` separate the evergreen production from each year's instance.

```sql
-- The evergreen entity: "Grammy Awards" exists once
productions (
  id uuid pk,
  name text,
  slug text unique,
  category text,          -- awards | sports | concerts | game_shows | reality | streaming | holiday | tech | gaming | corporate | political | international
  subcategory text,
  network_id fk,
  production_company_id fk,
  typical_month int,      -- 1–12, for recurring events
  recurring boolean,
  production_scale int,   -- 1–5 stars
  description text,
  logo_url text,
  hero_image_url text,
  created_at, updated_at
)

-- Each year's instance: "Grammy Awards 2027, Feb 1, Crypto.com Arena"
editions (
  id uuid pk,
  production_id fk,
  year int,
  start_date date,
  end_date date,
  venue_id fk,
  city_id fk,
  network_id fk,          -- nullable; null inherits productions.network_id
  status text,            -- confirmed | rumored | announced | completed | cancelled
  load_in date, tech_rehearsal date, dress_rehearsal date, show_date date, strike date  -- event timeline, all nullable
)

viewership (
  id uuid pk,
  production_id fk,
  year int,
  average_viewers numeric,
  peak_viewers numeric
)

venues (id, name, slug, address, city_id fk, capacity, website)
companies (id, name, slug, logo_url, headquarters, website)
networks (id, name, slug, logo_url, is_streaming boolean, website)
cities (id, name, slug, state, country, timezone, lat, lng)  -- lat/lng now = free map in Phase 3

-- Commercial-ready scaffolding (empty at launch, zero-cost to have)
profiles (id fk auth.users, display_name, role)   -- role: user | editor | admin
favorites (user_id fk, production_id fk)
```

**RLS from day one:** public read on all content tables, writes restricted to editor/admin. This IS the admin-panel permission system later.

**Amendment (Phase 1, search):** `20260811000000_search_indexes.sql` adds GIN indexes only — FTS expression indexes on `productions.name` / `description`, and `pg_trgm` indexes on the five searchable name columns. No tsvector column and no search RPC, deliberately: the palette queries through PostgREST's `fts` and `ilike` operators, so search behaves identically whether or not the migration has been applied, and nothing breaks in the window between deploying the UI and running `npm run db:push`. The index expressions must keep matching what PostgREST generates or the planner will ignore them.

**Amendment (batch 1, award shows):** `editions.network_id` added. `productions.network_id` alone assumed a production keeps one network for life, which the first real seed batch disproved three times — the Grammys move CBS→ABC in 2027, the Primetime Emmys rotate ABC/CBS/NBC/Fox annually, and the Actor Awards moved from broadcast to Netflix. The production-level column stays as the default; the edition-level one is set only where an edition differs. Migration: `20260806010000_edition_network.sql`.

---

## Phase 0 — Foundation & Seed Data (the moat)

**Goal: 250+ productions, ~400 editions, viewership for the top 100, before any real UI work.**

1. Init repo in Antigravity: Next.js 15 + TS + Tailwind 4 + shadcn/ui, Supabase project, schema migration above, generated types.
2. Build one throwaway internal tool first: `/admin/import` — paste JSON array of productions → validates → upserts. This makes seeding 10x faster than SQL inserts.
3. Seed in category batches using Claude research sessions. Batch order (highest lookup-value first):
   - Award shows (~40): Grammys, Oscars, Emmys, Golden Globes, Tonys, CMAs, ACMs, CMTs, AMAs, VMAs, BET, NAACP, SAG, Critics Choice, People's Choice, iHeartRadio, Billboard, Kids' Choice, ESPYs, NFL Honors, Rock Hall, Latin Grammys...
   - Game shows by tape city (~40): the entire Atlanta cluster (Family Feud, Press Your Luck, Weakest Link...), LA cluster (Wheel, Jeopardy!, The Price Is Right...)
   - Recurring sports broadcasts (~50): Super Bowl, NBA All-Star, MLB All-Star, WrestleMania, UFC numbered events, Daytona 500, Kentucky Derby, US Open(s), March Madness sites...
   - Streaming live events (~30): Netflix (NFL Christmas, Tudum, live comedy, SAG), Amazon TNF, Apple MLS...
   - Holiday/specials (~40): Macy's Parade, Rockefeller Tree, NYE broadcasts, Jingle Ball, halftime-adjacent specials, telethons
   - Reality live shows, tech keynotes (Apple, Google I/O, CES), political (debates, conventions, SOTU)
4. Each batch: research → JSON in the schema shape → paste into `/admin/import` → spot-check.

**Per-batch seed prompt pattern:** "Research the top N [category] productions. For each, return JSON matching this schema: name, category, network, production company, typical month, city, venue, recurring, scale (1–5), status of next edition, next edition dates if announced, avg viewership last 3 years if televised. Flag anything uncertain rather than guessing."

Uncertain data gets `status: rumored` — that's a feature (industry people love seeing rumors tracked), not a data-quality failure.

---

## Phase 1 — Public MVP (read-only, no accounts)

The product that answers the Atlanta phone call. Everything public, fast, dark.

**Pages:**
1. **Dashboard `/`** — "Upcoming" large cards (name, category icon, days-out countdown, city, status badge), sorted by next edition date. Bloomberg density, Apple restraint.
2. **Calendar `/calendar`** — custom month grid + agenda list view. Month/Agenda only at MVP (Week/Timeline/Year deferred — low value for month-scale events).
3. **Production page `/p/[slug]`** — hero, fact table (category, network, producer, venue, city, month, scale stars, status), viewership Recharts trend, edition history, event timeline (load-in → strike) when populated.
4. **City pages `/city/[slug]`** — upcoming productions, venues, typical busy months.
5. **Browse `/browse`** — TanStack Table, every production, filter by category/city/network/company/month/scale/status, sortable. This is the power-user page.
6. **Search** — global ⌘K command palette (shadcn), Postgres FTS + trigram across productions/venues/companies/cities. "Atlanta" → game show cluster. "Netflix" → their slate.
7. **Network `/network/[slug]` and Company `/company/[slug]` pages** — thin at first: logo, description, their productions.

**Design direction (locked):** dark-only at launch. Bloomberg information density × Apple restraint × Netflix dark palette. Countdown timers as a signature element (broadcast people live on countdowns). **`DESIGN.md` is now the source of truth** — tokens, the 20 primitives, and copy rules live there.

**Ship criteria:** deployed on Vercel, 250+ productions live, search under 200ms, fully usable on a phone.

### Phase 1 status

All seven pages are built and read the live database: `/`, `/calendar`, `/browse`, `/p/[slug]`, `/city/[slug]`, `/network/[slug]`, `/company/[slug]`, plus the ⌘K palette on `/api/search`. Production, city, network and company pages prerender via `generateStaticParams` with a 5-minute revalidate.

Two things gate "ship", and both are data, not code:

1. **The seed is at 34 productions against a 250 target.** The UI is built to be honest at that size rather than to hide it — 7 editions are currently scheduled ahead of today, 13 of 40 editions carry no date, and 28 of 34 productions have no viewership row. Every surface has a real empty or partial state instead of a filler.
2. **`20260811000000_search_indexes.sql` has not been applied.** Search is correct without it — the palette queries Postgres FTS and `ilike` through PostgREST — but it is unindexed until `npm run db:push` runs. At 34 productions that is not yet measurable; it is what keeps the "under 200ms" criterion true at 250.

**No images anywhere.** `logo_url` and `hero_image_url` are null on all 34 productions, so the type-only hero is the real path, not a fallback. The scrim and `next/image` wiring exist for when assets land.

---

## Phase 2 — Accounts, Personalization, Admin

1. Supabase Auth (magic link + Google).
2. Favorites/bookmarks → "My Grid" personal dashboard + personal calendar filtered to favorites.
3. **ICS feed per user** (`/api/calendar/[token].ics`) — this IS Google Calendar / Apple Calendar export via subscription URL. One endpoint, every platform. Build this before any notification system.
4. Email notifications (Resend): date announced/changed/confirmed for favorited productions.
5. **Admin panel** — evolve `/admin/import` into real CRUD: add/edit productions and editions, verify rumors (rumored → confirmed is the core editorial action), upload logos to Supabase Storage, user role management.
6. Community edit suggestions (form → editor approval queue). Cheap moderated crowdsourcing — freelancers on site know dates before trades publish them.

---

## Phase 3 — Intelligence & Commercial Layer

1. **AI assistant** — Claude API with tool access to the database (structured queries, not RAG). "What game shows tape in Atlanta?" hits the DB and cites production pages.
2. **Map** — Mapbox, city pins (lat/lng already in schema), click-through to city pages.
3. **Stats page** — largest, highest-viewed, longest-running, newest.
4. **Commercial:**
   - Free: browse, search, 5 favorites
   - Pro (individual freelancer): unlimited favorites, ICS feeds, notifications, early rumor access
   - Team (production companies / rental houses): shared boards, multi-seat
   - API access: metered keys — rental houses and staffing platforms are the real API customers
   - Stripe + Supabase RLS on gated columns/features
5. **Future (v2+):** crew call board, vendor/rental directory, studio database, travel layer.

---

## Antigravity Execution Briefs

Run phases as separate Antigravity task threads. Paste-ready briefs:

**Session 1 (P0 infra):**
> Scaffold Next.js 15 App Router + TypeScript + Tailwind 4 + shadcn/ui. Connect Supabase project [ref]. Create migration with this schema: [paste schema block]. Enable RLS: public SELECT on content tables, INSERT/UPDATE restricted to profiles.role in ('editor','admin'). Generate TypeScript types from the database. Build /admin/import: textarea accepting a JSON array of productions+editions, zod-validate against schema, upsert by slug, report results. No styling effort — internal tool.

**Sessions 2–7 (P0 seeding):** research batches per the category list above, one category per session, output JSON, import, spot-check.

**Session 8+ (P1):**
> Build the public MVP against the live Supabase data (never mock data): dashboard with upcoming-production cards and countdown timers, custom calendar month grid + agenda view, production detail pages with Recharts viewership trend, city pages, TanStack browse table with filters, ⌘K global search via Postgres FTS + pg_trgm. Dark theme only. Design direction: Bloomberg terminal density × Apple restraint — run a frontend-design pass, no default shadcn styling. Mobile-first; test every page at 390px.

**Rules for every session:** real data only; every page consumes the same API/route handlers the future public API will expose; commit per feature; deploy previews to Vercel continuously.

---

## Sequencing Summary

| Phase | Output | Rough effort |
|---|---|---|
| 0 | Schema + import tool + 250 productions seeded | The grind — mostly research sessions, light code |
| 1 | Public read-only Live Grid on Vercel | The build — biggest Antigravity phase |
| 2 | Accounts, favorites, ICS, admin CRUD | Fast — Supabase does the heavy lifting |
| 3 | AI, map, stats, monetization | Only after real usage validates it |

**First action:** Session 1 brief into Antigravity today. Schema + import tool is one sitting; then seeding runs in parallel with early UI work.
