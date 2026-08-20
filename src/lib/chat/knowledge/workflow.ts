/**
 * How a live show is built, rehearsed, and run — and what the words mean.
 *
 * The vocabulary section matters more than it looks: "live to tape", "as live" and
 * "pre-record" get used loosely in press coverage and precisely on a call sheet, and the
 * difference decides whether a crew is working a hard out.
 */
export const WORKFLOW = `
## The production timeline

The schema in this product stores five of these as dates on an edition: load_in,
tech_rehearsal, dress_rehearsal, show_date, strike.

1. **Site survey / tech scout** — weeks or months out. Department heads walk the venue with
   the producer. Power, rigging points, load-in doors, sightlines, truck parking, cable runs.
2. **Load-in** — trucks arrive, gear comes off, rigging goes up first because everything hangs
   from it. On an arena award show, load-in is typically three to seven days. On a late-night
   show in a standing studio, there is no load-in; the set lives there.
3. **Build and focus** — set assembly, LED wall build and mapping, lighting hang and focus,
   audio system tuning, camera placement and cabling.
4. **Tech rehearsal** — the first time the show is run against the technical facility. Usually
   without principal talent; stand-ins walk positions. This is where camera shots get assigned
   and lighting cues get built against real blocking.
5. **Camera blocking** — shot by shot, marking every camera's frame for every moment.
6. **Dress rehearsal** — full run, in costume, at speed, ideally with an audience for timing.
   On award shows, presenters rehearse in a block earlier in the day and rarely all together.
7. **Show** — the broadcast.
8. **Strike** — everything comes down. Often overnight, often the same night, and often the
   longest continuous shift of the job. Venues charge by the day, so strike is compressed for
   money reasons rather than production reasons.

## Live, live-to-tape, as-live, pre-record

- **Live** — transmitted as it happens. There is usually a short broadcast delay for standards
  compliance (in the US commonly five to ten seconds on network events), which is what allows
  an obscenity to be dumped. The delay is not editing; nothing can be fixed, only removed.
- **Live to tape** — recorded as if live, in order, with minimal or no stopping, and aired
  later. Late night and most daytime talk work this way: a show taped in the afternoon airs
  that night, and the crew works a show day, not a broadcast clock. Small fixes ("pickups") may
  be shot after the audience leaves.
- **As live** — a stricter version: recorded straight through with no stops and no fixes, so
  the finished piece is indistinguishable from a live transmission. Used when a live slot is
  impractical but the feel of live matters.
- **Pre-record** — shot out of order and edited. A "pre-rec" inside a live show is a package
  rolled from playback during the broadcast.

Award shows are mixed: the ceremony is live, the packages are pre-recorded, and the musical
numbers are often rehearsed to a pre-recorded backing track with live vocals.

## Running the show

- **Run of show (ROS) / rundown** — the ordered list of every element with its duration. The
  document the whole show runs from. Award shows commonly run a rundown in minutes and seconds
  per award, per package, per performance.
- **Backtiming** — working out, from the hard out, when each remaining element must start.
  The AD's core job during a live show.
- **Hard out** — a fixed end time that cannot move. Network live events almost always have
  one; the next programme is scheduled.
- **Calling the show** — the director's continuous instruction stream: "ready two, take two,
  ready jib push, and… take jib". Readies precede takes so operators have time to be right.
- **Cue lights, wraps and stretches** — signals to talent to speed up or slow down. On award
  shows the play-off music is a stretch/wrap device with teeth.
- **Standby / rolling / on air** — states everyone in the building shares.
- **Two-pop and slates** — alignment references on recorded material.

## Rehearsal vocabulary

- **Dry block** — walking positions without cameras.
- **Camera rehearsal** — with cameras, building the shot list.
- **Stopping down** — halting to fix. Available in rehearsal, not on air.
- **Q2Q (cue to cue)** — skipping the middle of scenes to rehearse only transitions.
- **Fire drill** — running the emergency version, e.g. what happens if a feed dies.

## Show-specific shapes

**Award shows.** Live, hard out, mixed live and pre-recorded. Distinctive elements: **seat
fillers** (so the room never reads empty on a wide), a **band** with its own mix and often its
own truck, category packages cut in advance and re-cut as nominations change, and rehearsed
walk paths from seat to stage timed to the music. Ballot security is a real production
constraint on the biggest shows — the results genuinely are not known to the crew.

**Sports.** The event owns the clock; the broadcast adapts. Distinctive elements: the
**compound** (the parking lot of trucks and generators outside the venue), **replay** as a
first-class department, a **world feed** vs **unilateral** split at international events, and
a **host broadcaster** model where one organisation produces the base coverage that every
rights-holder takes and augments. Studio wrap-arounds are frequently produced from a different
city than the game.

**Corporate and live events.** A **general session** (the big plenary in the main room) plus
**breakouts** (smaller parallel rooms). Run by a **show caller** rather than a broadcast
director when there is no broadcast — same function, different title and a different union
picture. Staging companies supply gear and crew as a package. Content is usually presenter
slides plus video, and rehearsal time with executives is the scarcest resource on the schedule.
Upfronts and product keynotes sit at the top end of this category and are produced to broadcast
standards even when nothing is broadcast.

**Late night and daytime talk.** Standing set, standing crew, taped in a fixed window most
weekdays. The production question is not "how do we build it" but "how do we turn it around
every day". Guest bookings drive the rundown.
`;
