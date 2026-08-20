/**
 * The business layer: unions, how a day rate is actually built, measurement, and the calendar
 * the industry runs on.
 *
 * Deliberately teaches STRUCTURE, not current numbers. Scale rates, tiers and contract terms
 * change with every negotiation and differ by local, agreement and market; a figure written
 * here would be wrong within a year and confidently wrong in the meantime. The shape of a
 * deal is stable and is what someone actually needs to reason about.
 */
export const BUSINESS = `
## Unions and guilds (United States)

- **IATSE** — the International Alliance of Theatrical Stage Employees. Covers most
  below-the-line crafts. Organised into **locals**, which matters enormously in practice: a
  local covers a craft in a territory, so the same job is a different local in a different
  city. Broadcast and live-event work commonly touches stagehand locals, studio mechanics
  locals, and the broadcast technicians who sit under IATSE or under NABET depending on the
  employer. Venues are often "IA houses", meaning the house crew is dispatched by the local
  and an incoming production hires through them.
- **NABET-CWA** — broadcast technicians at some networks, historically NBC and ABC operations.
  Which of NABET or IATSE covers a given technical role depends on the employer's agreement,
  not on the job title.
- **DGA** — Directors Guild: directors, associate directors, stage managers, and production
  associates on covered shows. On live television, the AD and SM being DGA is the norm on
  network work.
- **WGA** — writers, including award-show and variety writers.
- **SAG-AFTRA** — performers and broadcasters, including on-camera hosts and announcers.
- **AFM** — American Federation of Musicians: house bands, orchestras, and musicians on
  televised performances.
- **Teamsters Local 399** (Los Angeles) and equivalents — drivers, transportation captains,
  and location work.

Corporate and live-event work is a mixed picture: a general session in a union house uses the
house local for load-in and rigging even when the show's own crew is non-union, and the same
staging company may run union and non-union crews in different cities.

## How a day rate is built

Never quote a single number; a live-event rate is assembled from parts, and the parts are what
someone needs to check:

1. **Base day** — a defined number of hours (commonly 8 or 10 depending on the agreement),
   at a scale rate for union work or a negotiated rate for non-union.
2. **Overtime tiers** — time-and-a-half after the base day, double time beyond a further
   threshold, and often golden time beyond that. Live events routinely hit these; a strike
   overnight is an overtime shift by design.
3. **Turnaround** — the minimum rest between the end of one call and the start of the next.
   Breaching it triggers a penalty, and on a tight load-in/rehearsal/show sequence turnaround
   is often the binding constraint on the schedule, not the work itself.
4. **Meal penalties** — a defined interval between meals; running past it incurs escalating
   per-person penalties. This is why a production breaks on time even when it is behind.
5. **Kit / box rental** — a separate fee for a freelancer's own equipment (audio kit, camera
   accessories, tools, laptop and software). Negotiated separately from labour and, in the US,
   often treated differently for tax.
6. **Per diem, travel days, and hotel** — travel days are commonly paid at a reduced rate, and
   whether a travel day counts against turnaround is a negotiated point.
7. **Holiday and seventh-day premiums** — which is why Thanksgiving and Christmas broadcasts
   are expensive to crew and why holiday work is sought after.

**Deal memo** is the document that fixes all of this for a specific engagement. Read it for
the base day length, the overtime thresholds, the turnaround, the kit fee and the cancellation
terms — a live-event booking that can be cancelled without pay a week out is a real risk.

For current scale figures, consult the specific agreement and local in force. They change with
every negotiation cycle and vary by market.

## Measurement and ratings

- **Nielsen** remains the currency for US television. **Fast nationals** arrive the next
  morning and are the number the trades publish; they are revised later, occasionally
  materially.
- **Big data + panel** is Nielsen's current methodology, blending set-top and smart-TV return
  path data with the traditional panel. Year-over-year comparisons across a methodology change
  are not clean, and reporting that ignores this overstates growth.
- **Demo** — the advertiser-relevant age band. Adults 18–49 is the traditional entertainment
  demo, 25–54 for news and sport.
- **C3 / C7** — commercial ratings including three or seven days of delayed viewing, and the
  basis on which much advertising is actually sold.
- **Out-of-home** viewing (bars, gyms, airports) is now measured and materially inflates sports
  numbers relative to historical figures.
- **Streaming measurement** is not comparable to broadcast ratings. Platforms report "views"
  on their own definitions (often total watch time divided by runtime), and those definitions
  change. Treat any cross-platform comparison sceptically and say so.

## The calendar the industry runs on

- **Upfronts** (May, New York) — broadcast and major media companies present their slates to
  advertisers and sell inventory ahead of the season. Staged as full broadcast-grade
  productions in theatres; upfront week is one of the densest weeks in New York live
  production.
- **NewFronts** (spring) — the digital-first equivalent.
- **Award season** (roughly January to March) — Golden Globes, guild awards, BAFTA, Oscars,
  with the Grammys and the Emmys on their own cycles.
- **Sports tentpoles** anchor the rest: the Super Bowl in February, March Madness, the
  championship finals in June, the World Series in October, and the holiday game slates.
- **Trade press** — Variety, The Hollywood Reporter, Deadline for the industry generally;
  Sports Business Journal and Sports Media Watch for sports media; Broadcasting+Cable /
  NextTV and TVNewser for the broadcast business; Sports Video Group for live-production
  technology.

## Production incentives

US states compete with transferable or refundable tax credits, and the differences are large
enough to relocate a production outright. Georgia's credit built the Atlanta production
cluster; New Mexico, Louisiana, New York and California all run significant programmes with
different qualifying rules. Live-event and broadcast work qualifies unevenly — many programmes
were written for scripted film and television and exclude live sports or news — so whether a
game show or a special qualifies is a specific question about that state's statute, not a
general one.
`;
