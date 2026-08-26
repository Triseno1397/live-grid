/**
 * Live Grid — pass 1, done by machine.
 *
 * Run with `npm run discover -- --category gaming [--limit 60]`, or `-- --all`.
 *
 * The research protocol's pass 1 is "enumerate the candidates for this slice", and it has
 * been done from memory in a chat session. That is the pass a query is good at and a person
 * is not: Wikidata knows about six hundred esports competitions and nobody recalls the
 * fourteen that matter without a list to strike names off.
 *
 * ## What comes out is a CANDIDATE, not a seed
 *
 * `seeds/candidates/*.json` is a different shape from `ProductionInput` on purpose, and it
 * lives in a subdirectory `check-seeds.ts` does not descend into. A candidate is a lead. It
 * has not been checked, its dates have not been confirmed, and roughly a third of any list
 * will be an organisation or a one-off that does not belong in the grid at all. Passes 2–4
 * are unchanged.
 *
 * ## Why this cannot inflate confidence
 *
 * Four independent reasons, none of which rely on this script behaving:
 *
 *  1. Wikidata is `reference` tier. `rankConfidence` returns `single_source` when every
 *     citation is reference-tier *regardless of how many there are* — ten Wikidata URLs is
 *     still one source.
 *  2. `confidence` is derived by the importer from stored citations, and `ProductionInput` is
 *     strict with no `confidence` key. A file that tried to assert a tier fails validation.
 *  3. `seeds:check` errors on a `confirmed` future edition with no `official`-tier source, so
 *     the ceiling on anything Wikidata-derived is `announced`.
 *  4. This tool never emits `status` or `start_date`. A P585 that has not happened yet goes
 *     into `claims.unconfirmedDate` and stays there until a person confirms it against a
 *     primary source. Wikidata items for future editions are frequently auto-created stubs —
 *     the same trap as the aggregator pages `seeds/PROGRESS.md` warns about, and the reason
 *     the NBA Draft is deliberately absent from batch 008.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { slugify } from "../../src/lib/slug";
import { createServiceClient } from "../../src/lib/supabase/service";
import {
  buildDecorateQuery,
  buildSelectQuery,
  buildSubclassQuery,
  MAX_CLASSES,
  SLICES,
  type Slice,
} from "./queries";
import {
  commonsUrl,
  first,
  firstLabel,
  groupByItem,
  parsePoint,
  parseTime,
  qid,
  runQuery,
  type SparqlRow,
} from "./sparql";

const OUT_DIR = join(process.cwd(), "seeds", "candidates");
const TODAY = new Date().toISOString().slice(0, 10);

type Candidate = {
  qid: string;
  label: string;
  description: string | null;
  /** Wikipedia sitelinks — the notability proxy the query ranked on. Kept so a reader can too. */
  sitelinks: number;
  suggestedCategory: string;
  /** What `slugify(label)` gives, so a collision with the database is visible before seeding. */
  suggestedSlug: string;
  /** Already in `productions` under this slug. The single most useful column in the file. */
  alreadyInDb: boolean;
  claims: {
    inception?: string;
    /**
     * A P585 in the future. NOT a date — a lead on one.
     *
     * Named to be unusable by accident: nothing downstream reads `unconfirmedDate`, and
     * anyone copying it into `start_date` has to type the rename themselves.
     */
    unconfirmedDate?: string;
    /** A P585 in the past. Safe as history, still worth a second source. */
    pastDate?: string;
    officialWebsite?: string;
    broadcaster?: string;
    venue?: string;
    venueCapacity?: number;
    city?: string;
    country?: string;
    coords?: { lat: number; lng: number };
    logo?: string;
    image?: string;
    enWikipedia?: string;
  };
  /** The citation to paste, already in SourceInput shape. Always `reference` tier. */
  source: {
    url: string;
    publisher: "Wikidata";
    tier: "reference";
    title: string;
    retrieved_on: string;
  };
};

/**
 * "84th Academy Awards", "2023 League of Legends World Championship", "Eurovision Song
 * Contest 2020" — one year's instance of something, which the schema models as an `edition`
 * row rather than a `production`.
 *
 * Ordinal prefix, leading year, or trailing year. Kept deliberately narrow: "Super Bowl LIX"
 * is Roman-numbered and is NOT matched, because dropping it would lose a production whose
 * every instance is named that way, and a false drop is silent while a false keep is one
 * line a researcher skips.
 */
function isNumberedEdition(label: string): boolean {
  return (
    /^\d+(st|nd|rd|th)\s/i.test(label) ||
    /^(19|20)\d{2}[\s–-]/.test(label) ||
    /[\s–-](19|20)\d{2}$/.test(label)
  );
}

function toCandidate(slice: Slice, uri: string, rows: Parameters<typeof first>[0]): Candidate {
  const id = qid(uri);
  const label = firstLabel(rows, "itemLabel") ?? id;
  const time = parseTime(first(rows, "date"));
  const inception = parseTime(first(rows, "inception"));
  const capacity = Number(first(rows, "capacity"));

  const claims: Candidate["claims"] = {
    inception: inception ? String(inception.year) : undefined,
    officialWebsite: first(rows, "website"),
    broadcaster: firstLabel(rows, "broadcasterLabel"),
    venue: firstLabel(rows, "venueLabel"),
    venueCapacity: Number.isFinite(capacity) && capacity > 0 ? capacity : undefined,
    city: firstLabel(rows, "cityLabel"),
    country: firstLabel(rows, "countryLabel"),
    coords: parsePoint(first(rows, "coord")),
    logo: commonsUrl(first(rows, "logo")),
    image: commonsUrl(first(rows, "image")),
    enWikipedia: first(rows, "article"),
  };

  // The one branch that matters. A future date is a lead; a past date is history.
  if (time) {
    if (time.iso >= TODAY) claims.unconfirmedDate = time.iso;
    else claims.pastDate = time.iso;
  }

  return {
    qid: id,
    label,
    description: first(rows, "itemDescription") ?? null,
    sitelinks: Number(first(rows, "sitelinks") ?? 0),
    suggestedCategory: slice.category,
    suggestedSlug: slugify(label),
    alreadyInDb: false,
    claims: Object.fromEntries(
      Object.entries(claims).filter(([, v]) => v !== undefined),
    ) as Candidate["claims"],
    source: {
      url: `https://www.wikidata.org/wiki/${id}`,
      publisher: "Wikidata",
      tier: "reference",
      title: label,
      retrieved_on: TODAY,
    },
  };
}

/**
 * Marks candidates already seeded.
 *
 * Matched on slug, which is what the importer keys on, so this answers exactly the question
 * a researcher has: "would seeding this create a row or update one?" A false negative is
 * cheap — the batch author notices the name — and a false positive is impossible, because a
 * slug match IS a match as far as the write path is concerned.
 */
async function markKnown(candidates: Candidate[]): Promise<void> {
  if (candidates.length === 0) return;
  const db = createServiceClient();
  const slugs = [...new Set(candidates.map((c) => c.suggestedSlug))];

  const known = new Set<string>();
  for (let i = 0; i < slugs.length; i += 200) {
    const { data, error } = await db
      .from("productions")
      .select("slug")
      .in("slug", slugs.slice(i, i + 200));
    if (error) throw new Error(`productions: ${error.message}`);
    for (const row of data ?? []) known.add(row.slug);
  }

  for (const candidate of candidates) {
    candidate.alreadyInDb = known.has(candidate.suggestedSlug);
  }
}

/**
 * The classes to actually ask about.
 *
 * Wikidata's useful granularity lives in the subclass tree — "esports tournament" is a
 * subclass of "esport competition", and asking only about the root misses most of what you
 * want. But walking that tree inside the main query times out (see `buildSubclassQuery`), so
 * it is expanded first and spliced in as literals.
 *
 * A slice can opt out with `expandSubclasses: false` where its root is too broad for the tree
 * to mean anything.
 */
/**
 * Confirms each configured root Q-id still is what the config says it is.
 *
 * One cheap call, and the reason it exists is concrete: a draft of `queries.ts` used
 * Q1662611 for "video game convention". Q1662611 is **IT system**. Nothing errored — the
 * query simply pulled in 6,789 subclasses of computer hardware and timed out, and only the
 * timeout made it visible. A wrong-but-small Q-id would have discovered the wrong things and
 * produced a plausible file.
 *
 * A Q-id is an opaque identifier, which means a typo in one is undetectable by reading. This
 * is the check that makes it detectable.
 */
async function verifyClasses(slices: Slice[]): Promise<void> {
  const ids = [...new Set(slices.flatMap((s) => s.classes.map((c) => c.qid)))];
  const response = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}` +
      `&props=labels&languages=en&format=json`,
    { headers: { "user-agent": "LiveGrid-Discover/0.1 (+https://github.com/live-grid)" } },
  );
  if (!response.ok) throw new Error(`wbgetentities ${response.status}`);
  const body = (await response.json()) as {
    entities: Record<string, { labels?: { en?: { value: string } } }>;
  };

  const mismatches: string[] = [];
  for (const slice of slices) {
    for (const { qid: id, label } of slice.classes) {
      const actual = body.entities[id]?.labels?.en?.value;
      if (actual === undefined) {
        mismatches.push(`${id} does not exist (configured as "${label}")`);
      } else if (actual.toLowerCase() !== label.toLowerCase()) {
        mismatches.push(`${id} is "${actual}", not "${label}"`);
      }
    }
  }

  if (mismatches.length > 0) {
    console.error("Class ids in queries.ts do not match Wikidata:\n");
    for (const line of mismatches) console.error(`  ${line}`);
    console.error("\nFix queries.ts. A wrong class id discovers the wrong things silently.");
    process.exit(1);
  }
  console.log(`Verified ${ids.length} class id(s) against Wikidata.\n`);
}

async function expandClasses(slice: Slice): Promise<string[]> {
  if (slice.expandSubclasses === false) return slice.classes.map((c) => c.qid);

  const expanded = new Set<string>(slice.classes.map((c) => c.qid));
  for (const root of slice.classes) {
    const rows = await runQuery(buildSubclassQuery(root.qid), { timeoutMs: 60_000 });
    for (const row of rows) {
      const sub = row.sub?.value;
      if (sub) expanded.add(qid(sub));
    }
  }

  const all = [...expanded];
  if (all.length > MAX_CLASSES) {
    // Never silent. A capped run has stopped being a survey of the class and is now a survey
    // of whichever subclasses happened to come back first.
    console.log(
      `    ! ${slice.key}: ${all.length} subclasses, capped at ${MAX_CLASSES}. ` +
        `This slice is a sample, not a sweep — narrow its root classes for real coverage.`,
    );
    return all.slice(0, MAX_CLASSES);
  }
  return all;
}

/**
 * Three round trips: expand the classes, choose the items, then decorate them.
 *
 * See `buildDecorateQuery` for why the middle and last steps cannot be one query. Briefly:
 * selection alone answers in 218ms and selection-plus-decoration times out at 90 seconds,
 * because WDQS will not reliably materialise the ranked subquery before joining the OPTIONAL
 * block to it.
 */
async function discover(slice: Slice, limit: number): Promise<Candidate[]> {
  process.stdout.write(`  ${slice.key}: expanding classes… `);
  const classes = await expandClasses(slice);
  process.stdout.write(`${classes.length} classes; selecting… `);

  const selected = await runQuery(buildSelectQuery(slice, classes, limit));
  const sitelinks = new Map<string, number>();
  for (const row of selected) {
    const uri = row.item?.value;
    if (uri) sitelinks.set(uri, Number(row.sitelinks?.value ?? 0));
  }
  process.stdout.write(`${sitelinks.size} items; decorating… `);

  const ids = [...sitelinks.keys()].map(qid);
  const rows: SparqlRow[] = [];
  // Chunked: a VALUES list of a few hundred URIs is the next thing that gets slow.
  for (let i = 0; i < ids.length; i += 50) {
    rows.push(...(await runQuery(buildDecorateQuery(ids.slice(i, i + 50)))));
  }

  const grouped = groupByItem(rows);
  process.stdout.write(`${rows.length} rows → ${grouped.size} items\n`);

  const candidates = [...grouped].map(([uri, itemRows]) => {
    const candidate = toCandidate(slice, uri, itemRows);
    candidate.sitelinks = sitelinks.get(uri) ?? 0;
    return candidate;
  });

  // Wikidata models each year's ceremony as its own item, and those items are individually
  // notable — the first awards run came back as "Grammy Awards" followed by twenty numbered
  // Academy Awards. Live Grid already separates the evergreen production from its editions,
  // so a numbered edition is never what pass 1 is looking for; it is the same production,
  // twenty times, pushing twenty real candidates off the end of the list.
  const editionish = candidates.filter((c) => isNumberedEdition(c.label));
  if (editionish.length > 0) {
    console.log(
      `    (dropped ${editionish.length} numbered edition(s) — "${editionish[0].label}" and ` +
        `similar. The production they belong to is a separate item.)`,
    );
  }
  // Items whose label is still their Q-id have no English label, which in practice means no
  // English-language coverage at all. They are not candidates for a US broadcast database.
  return candidates
    .filter((c) => c.label !== c.qid && !isNumberedEdition(c.label))
    .sort((a, b) => b.sitelinks - a.sitelinks);
}

function write(slice: Slice, candidates: Candidate[]): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${slice.key}.json`);
  writeFileSync(file, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
  return file;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const category = argv.includes("--category") ? argv[argv.indexOf("--category") + 1] : null;
  const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : 80;

  if (!all && !category) {
    console.error("Usage: npm run discover -- --category <key> [--limit N]");
    console.error(`       npm run discover -- --all\n\nSlices: ${SLICES.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  const slices = all ? SLICES : SLICES.filter((s) => s.key === category);
  if (slices.length === 0) {
    console.error(`Unknown slice "${category}". Known: ${SLICES.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  await verifyClasses(slices);

  console.log(`Discovering ${slices.length} slice(s), ${limit} items each.\n`);

  for (const slice of slices) {
    const candidates = await discover(slice, limit);
    await markKnown(candidates);
    const file = write(slice, candidates);

    const fresh = candidates.filter((c) => !c.alreadyInDb).length;
    const dated = candidates.filter((c) => c.claims.unconfirmedDate).length;
    const withVenue = candidates.filter((c) => c.claims.venue).length;
    console.log(
      `    → ${file}\n` +
        `      ${candidates.length} candidates · ${fresh} not yet seeded · ` +
        `${withVenue} with a venue · ${dated} with an unconfirmed future date`,
    );
    console.log(`      ${slice.note}\n`);
  }

  console.log(
    "These are leads, not records. Passes 2-4 are unchanged: fill from independent sources,\n" +
      "corroborate against a second publisher, and confirm any upcoming date against the\n" +
      "primary. Wikidata is reference-tier and cannot on its own confirm anything.",
  );
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
