# Live Grid — Agent Rules

Read `LIVEGRID_PLAN.md` before any task. It is the roadmap and source of truth for scope, schema, and phase order. These rules apply to every session.

## Project

Live Grid — searchable database + calendar of live broadcast productions (award shows, sports broadcasts, game shows, concerts, streaming specials). Core user: broadcast freelancers and production companies answering "what's filming in [city] next month?"

## Stack (locked — do not substitute)

- Next.js 15 App Router, TypeScript strict, Tailwind CSS 4, shadcn/ui, Framer Motion
- Supabase: Postgres, Auth, Storage, RLS. Supabase JS client + generated types. **No Prisma. No other ORM.**
- Search: Postgres full-text + pg_trgm. **No Meilisearch/Algolia unless the plan's Phase 3 says so.**
- Tables: TanStack Table. Charts: Recharts. Calendar: **custom Tailwind grid — never install FullCalendar.**
- Deploy: Vercel via GitHub.

## Hard Rules

1. **Real data only.** Every page and component queries the live Supabase database. Never build against mock data, fixtures, or hardcoded arrays. If data is missing, say so — don't fabricate productions, dates, or viewership numbers.
2. **Schema is law.** The schema in LIVEGRID_PLAN.md is the source of truth. Any schema change requires a migration file and an update to the plan doc — never an ad-hoc column.
3. **API-first.** Pages consume the same route handlers / server functions a future public API will expose. No page-only data logic that would need rewriting for API access.
4. **Stay in phase.** Do not build Phase 2/3 features (auth, favorites, AI assistant, maps, payments) during Phase 0/1 sessions, even if convenient. Flag the idea, don't build it.
5. **RLS always on.** Public SELECT on content tables; writes require profiles.role in ('editor','admin'). Never disable RLS to make something work.
6. **Commit per feature.** Small commits, descriptive messages. Push so Vercel preview deploys run continuously.

## Design Direction (locked)

- **Dark mode only** at launch. Bloomberg terminal information density × Apple restraint × Netflix palette.
- No default shadcn gray-on-gray. Run an intentional design pass: typography hierarchy, spacing rhythm, one accent system.
- Signature element: **countdown timers** (days until show) on production cards.
- Status badges everywhere: confirmed / announced / rumored / completed — rumored is a feature, style it distinctly.
- Mobile-first. Every page must work at 390px before desktop polish. Use min-h-[100dvh] for full-height sections (iOS).
- Animate only transform/opacity. Respect prefers-reduced-motion.

## Writing & Naming

- Product name is **Live Grid** everywhere (repo, UI, metadata). Not "Broadcast Calendar."
- Slugs: kebab-case, stable, never regenerated on rename.
- Copy tone: precise, industry-native, zero marketing fluff.

## When Uncertain

Ask or flag — never guess at production facts, dates, or scope decisions. Uncertain seed data gets `status: rumored`, not an invented fact.
