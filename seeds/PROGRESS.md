# Seed sweep ledger

Durable state for the 600–800 production sweep. The sweep is far longer than one working
session, so this file — not anyone's memory — is what says where it got to.

**Target:** 800 productions / ~1600 editions across all 13 categories.
**At last update:** 215 productions / 303 editions, **all 13 categories populated**, 539
sources / 865 citations, 26 viewership rows. 21 productions remain `unverified` — the 18
older award shows and the three Atlanta game shows below.

Every category came off zero this sweep: `streaming`, `political`, `holiday`, `international`,
`gaming`, `concerts` and `reality`. The next question is depth, not coverage — `sports` at
25/180 and `corporate` at 9/70 are the widest gaps.

## Two things the sweep keeps running into

**Not everything is fetchable.** `oscars.org`, Variety and The Hollywood Reporter all refuse
automated fetches (403, or a redirect to a paywall proxy). Verification therefore runs mostly
through corroborating *search results* across independent publishers, with a direct fetch
where the site allows one. League and venue sites are the reliable ones — `nfl.com`,
`nba.com`, `mlb.com`, `nhl.com`, `netflix.com/tudum`, club sites, `profootballhof.com`,
`kentuckyderby.com`, `rydercup.com` all work.

**Aggregator pages lie in past tense.** A RealGM page presented the *2027* NBA Draft as
already run, with a date. It is a template stub. Anything phrased as settled about a future
event, on a site that auto-generates per-year pages, gets dropped rather than seeded — the
NBA Draft is absent from batch 008 for exactly this reason.

## The protocol

Every batch runs four passes. Passes 2–3 are the double check; pass 4 is the triple check and
applies only to editions dated today or later — the ones someone would actually act on.

| Pass | What | Leaves behind |
|---|---|---|
| 1 · Discover | Enumerate candidates for the slice. Name, category, one line on why it is a live or live-to-tape production. | A candidate list. No dates. |
| 2 · Fill | Research each: network, production company, city, venue, typical month, scale, upcoming edition, prior editions, viewership, key team. | Facts + one source per fact group. Gaps stay `null`. |
| 3 · Corroborate | Re-check every date, venue and network fact against a **different publisher**. | Second citation, or a downgrade: conflicting facts take the more authoritative value, keep one citation, and drop to `status: rumored` with the conflict noted. |
| 4 · Confirm | For upcoming editions only, check the primary source — network press site, venue calendar, league schedule, the event's own site. | An `official`-tier citation and `status: confirmed`, or it stays `announced`. |

Then the gates, in order:

```
npm run seeds:lookups                  # BEFORE writing: the vocabulary already in the database
npm run seeds:check                    # shape, dates, provenance, forks. --strict while authoring
npm run seeds:links -- --file 'NNN-*'  # do the cited pages exist?
npm run seeds:import -- seeds/NNN-slice.json --verify
```

`seeds:links` is the one that cannot be reasoned about from the file. Everything else in
`seeds:check` is deterministic and offline; whether a URL resolves is not, and a plausible URL
that was never read looks exactly like one that was to every other gate here. It found a dead
BBC citation on its first run over a corpus that had passed every check six times.

It is deliberately not wired into `seeds:check` — a network call has no business gating a
deterministic file checker. Run it per batch, and over the whole corpus periodically.

`--verify` is the idempotency proof, and it is now the machine's job rather than the reader's:
the CLI imports the batch, imports it again, and fails the run unless the second pass created
nothing, left `createdLookups` empty, and derived exactly the same confidence tally. A second
run should report almost entirely `unchanged` — that counter distinguishes "already correct"
from "rewritten with the same values", which is the difference between a proof and a shrug.

`/admin/import` still works and is the browser fallback; both call the same `runImport`.

`confidence` is never written by hand — the importer derives it from the citations that
actually landed. A `reference`-tier source alone (Wikipedia, aggregators, fan wikis) can never
exceed `single_source`.

And corroboration counts **domains, not publisher labels**. "Deadline" and "Deadline Hollywood"
are one outlet and two strings, and counting strings bought a `corroborated` tier with one
publisher's word. Two citations only corroborate each other if they come from two registrable
domains. Where one outlet genuinely publishes from two, `PUBLISHER_GROUPS` in `src/lib/url.ts`
merges them — that lowers a stored tier, so it comes with `npm run seeds:rederive`.

### Cleaning up after a correction

The importer is additive: it adds citations, never removes ones a file stopped mentioning,
because batch 006 hangs credits on citations batch 001 wrote. So correcting a rotted URL leaves
the old `sources` row behind, still attached, still reading as provenance.

```
npm run seeds:prune            # sources cited by no seed file. Dry by default
npm run seeds:prune -- --apply # deletes them; citations cascade
npm run seeds:rederive         # confidence is derived from citations that just changed
```

## Open questions the backfill turned up

**Where the Atlanta game shows actually tape.** `002-game-shows.json` records
`the-1-percent-club`, `celebrity-weakest-link` and `press-your-luck` in Georgia. Wikipedia's
infobox puts The 1% Club at Television City in Los Angeles, and a search summary claiming
seven game shows had shot in Georgia turned out not to be in the article it cited — the CBS
News Atlanta piece does not mention game shows at all.

So there is currently no source good enough to confirm Georgia *or* to overturn it. Wikipedia
is `reference` tier, which by this project's own rule is enough to find a fact and never
enough to settle one, and certainly not enough to rewrite a stored value. Those three records
are therefore left uncited rather than backed with something that would not survive being
read, and `002-game-shows.json` stays in `LEGACY_UNSOURCED`.

This matters more than a normal gap: "what tapes in Atlanta next month" is the question the
whole product is built around, and these are the rows that answer it. Worth a proper pass
against the shows' own audience-ticketing pages and the Georgia Film Office.

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
| 008 | `008-major-leagues.json` | sports · NBA/MLB/NHL | 7 | 4 | yes | 19 sources / 32 citations. All 14 records official. |
| 009 | `009-annual-classics.json` | sports · motorsport, racing, golf | 5 | 4 | yes | 14 sources / 22 citations. Masters is single-source — see below. |
| 011 | `011-streaming-live.json` | streaming | 23 | 4 | yes | 88 sources / 123 citations, 46 of 48 subjects `official`. 0 dead links. |
| 012 | `012-holiday.json` | holiday | 13 | 4 | yes | Westminster moves to Netflix; A Capitol Fourth moved off the Fourth for the 250th. |
| 014 | `014-gaming-esports.json` | gaming | 23 | 4 | yes | 39 of 56 subjects official. EWC 2026 moved Riyadh → Paris, which the candidate file did not know. |
| 015 | `015-political.json` | political | 20 | 4 | yes | 66 sources / 109 citations. 2028 conventions and debates left undated — nothing announced. |
| 016 | `016-international.json` | international | 9 | 4 | yes | Eurovision → Burgas, Sundance → Boulder, Berlinale restructures its run of show. |
| 018 | `018-concerts-festivals.json` | concerts | 23 | 4 | yes | 51 URLs, 0 warnings — the cleanest link check in the corpus. Coachella skipped as a duplicate of the streaming record. |
| 020 | `020-sports-depth.json` | sports | 6 | 4 | yes | CFP, Final Four, WrestleMania, Royal Rumble, Army–Navy, F1 Vegas. |
| 010 | `010-reality-live.json` | reality | 20 | 4 | yes | 36 of 40 subjects official. Bachelor/Bachelorette dropped — S22 pulled before air, S30 has no lead. |
| 021 | `021-awards-2027.json` | awards | 4 | 4 | yes | PGA new; Golden Globes / Critics Choice / Actor Awards 2027 dates filled in. |
| 019 | `019-source-backfill.json` | backfill | 33 | 4 | yes | tech, variety, upfronts and the six upcoming award shows. 21 productions still uncited — awards (18 old ones) and the three Atlanta game shows above. |

Batches 000–006 predate the provenance schema. They are listed in `LEGACY_UNSOURCED` in
`scripts/check-seeds.ts`, which downgrades their missing-source errors to warnings. **Batch
019 backfills their citations and empties that list.** Nothing else may be added to it.

Three files have already left it — `003-upfronts.json`, `004-tech-keynotes.json` and
`005-variety.json`. That became possible when `seeds:check` learned to union sources across
files by slug: the citations land in 019 and the bare record stays in its original file, so a
per-file check would have called those files unsourced forever no matter how complete the
backfill was.

## Coverage plan

Keep every batch **≤60 records**, and the reason is editorial rather than technical: one batch
should be one reviewable diff and one commit.

It used to be technical. Every write was a separate PostgREST round trip at ~150ms, batch 007
took 55 seconds for 8 records, and 25 was the honest ceiling against Vercel's 300s. The bulk
prefetch changed the arithmetic — one `.in()` read per table up front instead of a SELECT
before every write, one confidence pass instead of one per record, and a no-op patch skipped
rather than rewritten. Re-measured on the same batch 007: **1.2 seconds**, 0.15s per record.
The whole 84-record corpus imports in 1.6s. Running through `npm run seeds:import` removes the
300s ceiling entirely.

**Imports are serialised.** Research a wave of batches concurrently if you like — every write
key is stable, so batches converge rather than collide. But two `seeds:import` processes
running at once will both miss on a shared lookup like `netflix`, both insert, and one takes a
`23505`. At ~2s a batch there is nothing to gain by overlapping them.

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
