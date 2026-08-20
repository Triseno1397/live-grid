# Seed sweep ledger

Durable state for the 600–800 production sweep. The sweep is far longer than one working
session, so this file — not anyone's memory — is what says where it got to.

**Target:** 800 productions / ~1600 editions across all 13 categories.
**At last update:** 57 productions / 107 editions across 5 categories.

## The protocol

Every batch runs four passes. Passes 2–3 are the double check; pass 4 is the triple check and
applies only to editions dated today or later — the ones someone would actually act on.

| Pass | What | Leaves behind |
|---|---|---|
| 1 · Discover | Enumerate candidates for the slice. Name, category, one line on why it is a live or live-to-tape production. | A candidate list. No dates. |
| 2 · Fill | Research each: network, production company, city, venue, typical month, scale, upcoming edition, prior editions, viewership, key team. | Facts + one source per fact group. Gaps stay `null`. |
| 3 · Corroborate | Re-check every date, venue and network fact against a **different publisher**. | Second citation, or a downgrade: conflicting facts take the more authoritative value, keep one citation, and drop to `status: rumored` with the conflict noted. |
| 4 · Confirm | For upcoming editions only, check the primary source — network press site, venue calendar, league schedule, the event's own site. | An `official`-tier citation and `status: confirmed`, or it stays `announced`. |

Then `npm run seeds:check` before anything is pasted, then `/admin/import`, then re-import the
same batch to prove idempotency (0 created / N updated, empty `createdLookups`).

`confidence` is never written by hand — the importer derives it from the citations that
actually landed. A `reference`-tier source alone (Wikipedia, aggregators, fan wikis) can never
exceed `single_source`.

## Batches

| # | File | Slice | Records | Pass | Imported | Notes |
|---|---|---|---|---|---|---|
| 000 | `000-session1-smoke.json` | smoke | 2 | — | yes | Pre-provenance. Overlays 001/002. |
| 001 | `001-award-shows.json` | awards | 25 | — | yes | Pre-provenance. Web-verified in commit `cd5bffb`. |
| 002 | `002-game-shows.json` | game shows | 9 | — | yes | Pre-provenance. |
| 003 | `003-upfronts.json` | corporate · upfronts | 9 | — | yes | Pre-provenance. |
| 004 | `004-tech-keynotes.json` | tech | 6 | — | yes | Pre-provenance. |
| 005 | `005-variety.json` | variety | 8 | — | yes | Pre-provenance. |
| 006 | `006-production-team.json` | team overlay | 4 | — | yes | Pre-provenance. Overlays 001. |
| 007 | `007-nfl-tentpoles.json` | sports · NFL | 8 | 4 | yes | 26 sources / 47 citations. 14 official, 3 corroborated, 3 single-source. |
| 019 | `019-source-backfill.json` | backfill | 1 of 57 | 4 | yes | Academy Awards done. 56 productions still uncited. |

Batches 000–006 predate the provenance schema. They are listed in `LEGACY_UNSOURCED` in
`scripts/check-seeds.ts`, which downgrades their missing-source errors to warnings. **Batch
019 backfills their citations and empties that list.** Nothing else may be added to it.

## Coverage plan

Keep every batch **≤25 records**. Not style — the importer makes a separate PostgREST round
trip per write at ~150ms each, and Vercel's ceiling is 300s (`maxDuration` on the import
route).

Measured on batch 007: **8 records with 26 sources and 47 citations took 55 seconds**, about
7s per record. Citations dominate, and they are the one thing a per-run cache cannot amortise
— lookups repeat across records, a citation is unique to its subject. A record with deep
edition history and a source per fact costs closer to 10s, so 25 is the honest ceiling, not
the 35 the original plan assumed.

### Wave 1 — the empty categories (batches 007–019)

| Slice | Target | Scope |
|---|---|---|
| `sports` | ~180 | NFL tentpoles (Super Bowl, Draft, Kickoff, Thanksgiving/Christmas), NBA/MLB/NHL all-star + championship + draft, college (CFP, bowls, March Madness sites, GameDay, Army–Navy), FIFA World Cup 2026 US venues, MLS Cup, combat (WWE PLEs, AEW, UFC numbered, boxing PPVs), motorsport (Daytona, Indy, NASCAR playoffs, F1 Miami/Austin/Vegas), golf majors + Ryder Cup, tennis, Kentucky Derby/Breeders' Cup, X Games, LA 2028 runway, ESPN/FS1 studio shows |
| `streaming` | ~50 | Netflix live (NFL Christmas, Tudum, WWE Raw, live comedy, the Actor Awards), Prime (TNF, NBA, NASCAR, Black Friday), Apple (MLS, Friday Night Baseball), Peacock (SNF, Premier League, Olympics), YouTube (Sunday Ticket, Brandcast, Coachella), Tubi, Twitch |
| `holiday` | ~60 | Macy's Parade, Rose Parade, Rockefeller tree, NYE broadcasts, Fourth of July (Macy's fireworks, A Capitol Fourth, Boston Pops), Kennedy Center Honors, Memorial Day Concert, National Tree Lighting, Puppy Bowl, Westminster |
| `reality` | ~60 | Live-vote and live-finale shows with real tape cities: The Voice, Idol, DWTS, Big Brother, Survivor, AGT, Masked Singer, Love Island USA, Drag Race, The Traitors, Top Chef, MasterChef |
| backfill | 57 | Batch 019 — citations for everything seeded before provenance existed |

### Wave 2 — depth (batches 020–030)

| Slice | Target | Scope |
|---|---|---|
| `concerts` | ~70 | Festival broadcasts (Coachella, Lollapalooza, ACL, Stagecoach, Bonnaroo, EDC, Gov Ball, Outside Lands, Jazz Fest, CMA Fest), iHeartRadio Music Festival, Jingle Ball, Global Citizen, Farm Aid, Austin City Limits |
| `international` | ~50 | Eurovision, BAFTAs, BRITs, Cannes/Venice/Berlin/TIFF/Sundance/SXSW, Junos, ARIAs, MTV EMAs, Latin Grammys, Premio Lo Nuestro, IIFA/Filmfare, MAMA/Golden Disc, Kōhaku Uta Gassen, Nobel ceremony, Miss Universe, Rugby World Cup, Copa América, AFCON, Tour de France |
| `awards` | ~60 | Guild awards (PGA, DGA, WGA, ADG, CDG, ACE, CAS), Sports/News/Daytime Emmys, Tonys/Oliviers, Peabody, Webby, Clio, Cannes Lions, MTV Movie & TV, Streamys, Dove, Stellar, NAACP Image, GLAAD, Spirit, Gotham |
| `corporate` | ~60 | Every upfront + NewFronts, shareholder/investor days, auto shows, trade shows with major AV (NAB, InfoComm, IBC, LDI, NRF, HIMSS, Davos, TED, Web Summit), sales kickoffs |
| `political` | ~35 | 2028 debate cycle, primary debates, SOTU, DNC/RNC 2028, election night, inaugurations, WHCD, Al Smith Dinner, CPAC, town halls |
| `game_shows` | ~40 | Finish the LA and Atlanta clusters, syndicated slate, primetime revivals, GSN/Buzzr |
| `variety` | ~40 | Full late-night slate, daytime talk, SNL and its specials, Real Time, Last Week Tonight |
| `gaming` | ~30 | The Game Awards, Summer Game Fest, Gamescom ONL, EVO, LoL Worlds, Valorant Champions, CS Majors, TI, CoD Champs, Pokémon Worlds, TwitchCon, PAX, Esports World Cup, Nintendo Direct, State of Play, Xbox Showcase |
| `tech` | ~30 | WWDC, Google I/O, Build, Ignite, re:Invent, GTC, CES keynotes, MWC, Dreamforce, Adobe MAX, Oracle CloudWorld, SAP Sapphire, Cisco Live, Snowflake Summit, INBOUND |

## Taxonomy discipline

The 13 categories are fixed. `subcategory` carries the finer distinction — it is free text so
the enum does not grow a row per format, which also means it drifts, which is why
`seeds:check` warns on near-duplicate subcategory values.

One rule settles the overlap that batches 003 and 004 left behind:

- **`tech`** — developer and product keynotes, tech-industry conferences.
- **`corporate`** — upfronts, shareholder meetings, brand events, trade shows, sales kickoffs.

A new category value means a migration, a `CATEGORIES` update, and a `LIVEGRID_PLAN.md`
amendment. That friction is deliberate.
