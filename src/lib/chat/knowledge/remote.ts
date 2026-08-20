/**
 * Remote production: trucks, compounds, REMI, and how an event reaches air from a car park.
 *
 * This is the part of the industry the Live Grid data is really about — a production's city
 * and venue matter because they determine who gets the call and where the trucks park.
 */
export const REMOTE = `
## The compound

At any large outdoor or arena event, the broadcast facility is a **compound**: a fenced area
of mobile units, generators, and cable running into the venue. Typical contents are the A unit
(production/control), a B unit (support, replay, edit), an audio unit on big music or awards
shows, generators with redundancy, a satellite or fibre transmission point, catering, and
production offices in trailers.

Compound planning is a real production constraint. Cable runs have length limits, trucks need
crane access and level ground, generators need to be far enough from microphones, and the
venue often wants the space for something else. On a stadium event the compound is designed
months out and is a line item in the host agreement.

## Mobile units

The large US mobile-unit companies are **NEP Group**, **Game Creek Video**, **Mobile TV
Group**, and **F&F Productions**. Trucks are booked as units — often an A/B pair — with an
**EIC (engineer in charge)** who owns the facility. A truck is specified by camera count,
switcher, replay channels and audio console, and the same truck may do an NFL game one day and
an award show the next.

**Flypack** — a rack-mounted, roadable control room that ships as cases rather than driving as
a truck. Used where a truck cannot go: inside a convention centre, overseas, on a stage in a
ballroom. Corporate general sessions and international events run on flypacks constantly.

## REMI / at-home production

**REMI** (remote integration model), also called **at-home** or **centralised** production,
leaves cameras and a small crew at the venue and sends the feeds back to a permanent control
room elsewhere, where the director, TD, replay and audio all sit. The venue crew shrinks to
camera operators, an A2 or two, and a small engineering presence.

Why it exists: it cuts travel and per diem, lets one control room cover several events in a
day, and turns a truck booking into a fibre booking. What it costs: latency has to be managed
tightly (a director calling shots on a delayed feed is calling them late), the connectivity has
to be genuinely redundant because there is no local fallback, and the on-site crew loses the
ability to walk into the truck and be told what is happening.

REMI is now standard for mid-tier live sport, college conference networks, and much of
streaming's volume programming. Tentpole events — Super Bowl, award shows, championship
finals — still overwhelmingly go full on-site, because the failure cost is too high and the
production is too bespoke.

## World feed, host broadcaster, unilateral

At major international events one organisation is the **host broadcaster** and produces the
**world feed** (also "clean feed" or "international feed"): the base coverage, with natural
sound and no commentary, that every rights-holder receives. Olympic Broadcasting Services does
this for the Olympics; FIFA's production arm does it for the World Cup.

Each rights-holding broadcaster then adds **unilateral** coverage: their own commentary
position, their own cameras for their own audience, their own studio set and pre/post shows.
So a single event has one host operation and a dozen parallel national operations sharing the
same compound and the same venue.

For a freelancer this distinction decides who is hiring. Host-broadcaster crews are booked
long in advance through the host organisation; unilateral crews are booked by the individual
network, usually later and often locally.

## Transmission

- **Fibre** is the default for anything with a fixed venue and lead time.
- **Satellite (SNG)** remains the fallback and the answer for genuinely remote locations.
- **Bonded cellular** — a unit bonding several mobile connections — covers roving and
  breaking-news positions, and increasingly the cheaper end of live sport.
- **Redundancy** is the whole discipline: a tentpole event runs diverse paths on diverse
  physical routes, because a single backhoe should not end a broadcast.

## Studios and standing facilities

Late night, daytime, game shows and news run from standing studios, where the "load-in" was
years ago and the daily job is turnaround. Notable clusters: the Los Angeles studio zone
(Burbank, Hollywood, Culver City, the Universal lot), New York (30 Rock, Broadway Video, the
Ed Sullivan Theater, Silvercup and Steiner in the outer boroughs), and Atlanta, which grew a
game-show and unscripted cluster on the back of Georgia's tax incentive.

Incentives move productions in a way nothing else does. A production that can shoot anywhere
will shoot where the credit is best, which is why game-show tapings migrated to metro Atlanta
and why the state a show tapes in is frequently unrelated to the state it is set in.
`;
