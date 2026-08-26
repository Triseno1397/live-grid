/**
 * What to ask Wikidata for, per Live Grid category.
 *
 * **Every Q-id below was checked against the live service, not recalled.** That is not
 * caution for its own sake: the first draft of this file used Q17315159 for "esports
 * tournament", which is real, is not esports, and returns FIFA World Cup finals. A wrong
 * class id does not fail — it quietly discovers the wrong thing, which is the same failure
 * mode as a wrong citation.
 *
 * Scoped to six categories. Wikidata's coverage of US live *television production* is strong
 * for festivals and tournaments and close to useless for upfronts, streaming specials and
 * reality-show finales — those have no encyclopedia entry until after they air, if ever.
 * `reality`, `streaming`, `corporate`, `game_shows`, `variety` and `tech` stay pure research,
 * and pretending otherwise would add a plumbing step that returns nothing.
 *
 * ## How much each slice actually earns, measured
 *
 * | Slice | Verdict |
 * |---|---|
 * | `international` | **Strong.** Cannes, Berlin, Venice, TIFF, Miss Universe, Sundance — the list is the batch. |
 * | `concerts` | **Strong.** Glastonbury, Coachella, Tomorrowland, Lollapalooza, Sanremo. |
 * | `gaming` | **Good.** The International, LoL Worlds, PAX, DreamHack, EWC. Mixed with organisations (ESL is a company, not a production). |
 * | `sports` | **Thin.** Broad class, most items lack the properties worth having. A top-up, not a spine. |
 * | `awards` | **Weak — 8 candidates.** Most US ceremonies are not `P31 award ceremony` at all; the Oscars and Emmys simply do not come back. Research still leads here. |
 * | `holiday` | **Weak.** `parade` returns political marches and `television special` returns Marvel specials and Friends: The Reunion. Real leads are in there, but a person is doing the work. |
 *
 * Left honest rather than tuned into looking better. A discovery tool that quietly returns
 * the wrong genre is worse than one that returns little, because the little is obvious.
 */

import type { CATEGORIES } from "../../src/lib/import/schema";

type Category = (typeof CATEGORIES)[number];

export type Slice = {
  /** File suffix and `--category` value. */
  key: string;
  /** Where its candidates would land if seeded. A suggestion for the researcher, not a claim. */
  category: Category;
  /** Wikidata classes, as Q-ids. Every one verified against wbsearchentities. */
  classes: { qid: string; label: string }[];
  /**
   * Minimum Wikipedia sitelinks.
   *
   * The single most important knob here. Wikidata holds every individual edition of every
   * regional StarCraft league from 2004, most without an English label; sitelink count is the
   * standard proxy for "does anyone outside the wiki care". Raising this trades recall for a
   * candidate list a person will actually read.
   */
  minSitelinks: number;
  /** Extra SPARQL, spliced into the inner SELECT. Country filters, mostly. */
  filter?: string;
  /**
   * Expand the class list through `P279*` before querying. Default true.
   *
   * Turn it off where the root's tree is too broad to be a slice: `sports competition` has
   * 11,174 subclasses, and the useful ones are a handful named directly.
   */
  expandSubclasses?: boolean;
  note: string;
};

/**
 * Every root class, with the label the service reports for it.
 *
 * `verifyClasses` in `wikidata.ts` fetches these labels at runtime and refuses to query if
 * one has drifted. That is not ceremony: an earlier draft used Q1662611 for "video game
 * convention", and Q1662611 is **IT system** — it did not error, it pulled in 6,789
 * subclasses of computer hardware and timed the query out, and the only reason it was caught
 * is that the timeout was loud. A Q-id that is merely *wrong* rather than *huge* would have
 * silently discovered the wrong things and looked like it worked.
 */

/** Countries whose live productions the grid actually covers. Used by the filters below. */
const US = "wd:Q30";

export const SLICES: Slice[] = [
  {
    key: "gaming",
    category: "gaming",
    // Q48004378 "esport competition". NOT Q17315159, which is a football match.
    classes: [
      { qid: "Q48004378", label: "esport competition" },
      { qid: "Q63349452", label: "esports league" },
      { qid: "Q3070242", label: "gaming convention" },
    ],
    minSitelinks: 6,
    note: "The International, LoL Worlds, EWC, PAX, QuakeCon. Expect organisations (ESL, DreamHack) mixed in — they are companies, not productions, and get dropped in pass 1.",
  },
  {
    key: "awards",
    category: "awards",
    classes: [
      { qid: "Q4504495", label: "award ceremony" },
      { qid: "Q115915900", label: "film award ceremony" },
    ],
    minSitelinks: 5,
    filter: `OPTIONAL { ?item wdt:P17 ?c } FILTER(!BOUND(?c) || ?c = ${US})`,
    note: "US ceremonies, plus items with no country set — many production items omit P17 entirely, and excluding them lost the Emmys and the Tonys.",
  },
  {
    key: "international",
    category: "international",
    classes: [
      { qid: "Q4504495", label: "award ceremony" },
      { qid: "Q220505", label: "film festival" },
      { qid: "Q2658935", label: "beauty contest" },
    ],
    minSitelinks: 12,
    filter: `OPTIONAL { ?item wdt:P17 ?c } FILTER(!BOUND(?c) || ?c != ${US})`,
    note: "Eurovision, BAFTAs, Cannes, Venice, Miss Universe. Higher floor because the class is broad and global.",
  },
  {
    key: "concerts",
    category: "concerts",
    classes: [{ qid: "Q868557", label: "music festival" }],
    minSitelinks: 10,
    note: "Coachella, Lollapalooza, Glastonbury. Only the ones with a broadcast or stream belong in the grid — that is pass 1's job, not the query's.",
  },
  {
    key: "holiday",
    category: "holiday",
    classes: [
      { qid: "Q657449", label: "parade" },
      { qid: "Q1261214", label: "television special" },
    ],
    minSitelinks: 4,
    filter: `OPTIONAL { ?item wdt:P17 ?c } FILTER(!BOUND(?c) || ?c = ${US})`,
    note: "Macy's Thanksgiving, Rose Parade, tree lightings, holiday specials. The parade class also returns political marches — real parades, not broadcast productions, and pass 1 drops them.",
  },
  {
    key: "sports",
    category: "sports",
    classes: [
      { qid: "Q13406554", label: "sports competition" },
      { qid: "Q27020041", label: "sports season" },
      { qid: "Q119778717", label: "sports competition series" },
    ],
    // 11,174 subclasses under the root — an expansion here would be a cap, not a survey.
    expandSubclasses: false,
    minSitelinks: 10,
    filter: `OPTIONAL { ?item wdt:P17 ?c } FILTER(!BOUND(?c) || ?c = ${US})`,
    note: "Very broad class with a high floor — this is a top-up for the sports batches, not their spine.",
  },
];

/**
 * How many expanded subclasses one slice may carry into a VALUES clause.
 *
 * `sports` sits under a root with 11,174 subclasses, which is a different kind of query from
 * the one this tool is for. Truncation is reported rather than silent — a capped run has
 * quietly stopped being a survey, and the log line is what stops it reading like one.
 */
export const MAX_CLASSES = 400;

/**
 * The subclass tree under one root, as its own query.
 *
 * Splitting this out is not tidiness, it is the difference between working and not.
 * `?item wdt:P31/wdt:P279* ?class` joined against `wikibase:sitelinks` **times out at 90
 * seconds** — measured, on every variant including `P279?`. The same tree asked for on its
 * own comes back in under a second, and a direct `wdt:P31` against an explicit VALUES list
 * takes 295ms. Two cheap queries, not one impossible one.
 */
export function buildSubclassQuery(rootQid: string): string {
  return `SELECT ?sub WHERE { ?sub wdt:P279* wd:${rootQid} . }`;
}

/**
 * Step 2: WHICH items, ranked by notability. No decoration.
 *
 * Sitelink count is the ranking that makes the output readable. Wikidata holds every
 * individual edition of every regional StarCraft league from 2004, most with no English
 * label; without a notability order, `LIMIT 60` returns sixty of those and none of the
 * fourteen productions a person was looking for.
 */
export function buildSelectQuery(slice: Slice, classQids: string[], limit: number): string {
  const values = classQids.map((q) => `wd:${q}`).join(" ");

  return `SELECT ?item ?sitelinks ?label WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class .
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${slice.minSitelinks})
  ${slice.filter ?? ""}

  # An English label, bound directly rather than through the label SERVICE — the service is
  # for presentation and runs after the pattern; this has to run inside it, because the
  # filters below need the label to choose WHICH items make the limit.
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "en")

  # Numbered editions, excluded here rather than in the caller.
  #
  # Wikidata models each year's ceremony as its own notable item, and those individual items
  # outrank the evergreen production on sitelinks — filtering after the fact, the awards
  # slice came back as 82 numbered Academy Awards and 5 productions. The limit has to be
  # spent on things that survive, so the filter belongs in front of it.
  #
  # Roman numerals are deliberately NOT excluded: "Super Bowl LIX" is an edition, but every
  # instance of that production is named that way and dropping them all would lose it.
  FILTER(!REGEX(?label, "^[0-9]+(st|nd|rd|th)\\\\s", "i"))
  FILTER(!REGEX(?label, "^(19|20)[0-9]{2}[\\\\s\\u2013-]"))
  FILTER(!REGEX(?label, "[\\\\s\\u2013-](19|20)[0-9]{2}$"))
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}`;
}

/**
 * Step 3: everything known about an explicit, already-chosen set of items.
 *
 * The obvious single query — the selection as a subquery, the OPTIONALs outside it — is the
 * one thing that does not work here. It **times out at 90 seconds** even with the selection
 * alone answering in 218ms, because WDQS will not reliably materialise an ORDER BY / LIMIT
 * subquery before joining the OPTIONAL block against it, so the optional properties get
 * evaluated across the whole class rather than across sixty items. Handing it the sixty
 * item ids as literals removes the planner's discretion, and the query becomes trivial.
 *
 * Three cheap round trips per slice, then. Chunked by the caller, because a VALUES list of
 * a few hundred URIs is the next thing that would get slow.
 */
export function buildDecorateQuery(itemQids: string[]): string {
  const values = itemQids.map((q) => `wd:${q}`).join(" ");

  return `SELECT ?item ?itemLabel ?itemDescription ?inception ?date ?website ?logo ?image
       ?broadcasterLabel ?venueLabel ?capacity ?coord ?cityLabel ?countryLabel ?article
WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P585 ?date . }
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL { ?item wdt:P154 ?logo . }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P449 ?broadcaster . }
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL {
    ?item wdt:P276 ?venue .
    OPTIONAL { ?venue wdt:P1083 ?capacity . }
    OPTIONAL { ?venue wdt:P625 ?coord . }
    OPTIONAL { ?venue wdt:P131 ?city . }
  }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}
