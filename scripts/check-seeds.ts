/**
 * Live Grid — mechanical seed check.
 *
 * Run with `npm run seeds:check` before pasting anything into /admin/import.
 *
 * The research protocol's three passes (fill, corroborate, confirm against primary) are
 * judgement calls made by a person reading sources. This is the part a person cannot do
 * reliably across two dozen files and eight hundred records: cross-file slug collisions,
 * a record that quietly lost its sources, a "confirmed" date backed only by a fan wiki,
 * a timeline that runs backwards.
 *
 * It reads the files, not the database, so it catches a fork BEFORE the import creates it.
 * Once two rows exist, only `orphanLookups` on /admin will notice, and only if one of them
 * ends up referenced by nothing.
 *
 * Exit code 1 on any error. Warnings never fail the run — they are for eyes, not gates.
 */

import { CATEGORIES, ProductionInput, STATUSES } from "../src/lib/import/schema";
import { CATEGORY_TARGETS, SEED_TARGETS } from "../src/lib/stats";
import { slugify } from "../src/lib/slug";
import { isReferenceDomain, registrableDomain } from "../src/lib/url";
import {
  allSourcesOf,
  editionsOf,
  loadSeedRecords,
  sourcesOf,
  type Loaded,
  type Problem,
  type SourceLike,
} from "./lib/seeds";

/** Today in the same ISO form the seeds use, in UTC so the check is machine-independent. */
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * How long a citation on a FUTURE edition stays trustworthy before it wants another look.
 *
 * Only future editions: a viewership figure sourced in 2019 is as true as it was then, while
 * a 2027 date read eight months ago has had eight months to move.
 */
const STALE_AFTER_DAYS = 180;

/**
 * `--strict` promotes the time-sensitive warnings to errors.
 *
 * On for the person authoring a batch, off for a sweep over the whole corpus. The difference
 * matters: a seed file is a snapshot, so "this confirmed edition is now in the past" is a
 * fact about the calendar rather than a defect in the file, and erroring by default would
 * turn every old and correct batch red on a clock tick. That is the same cries-wolf failure
 * `findOrphanLookups` was fixed for.
 */
const STRICT = process.argv.slice(2).includes("--strict");

/**
 * Batches imported before the provenance migration existed. Their facts were verified — the
 * commit messages for each are unusually detailed about how — but the citations were never
 * written down anywhere a machine can read.
 *
 * Listed explicitly rather than tolerated silently so the debt is visible in code and the
 * gate stays live for everything new. Batch 019 backfills these and empties this array; a
 * file only earns a place here by predating the schema, never by being in a hurry.
 *
 * Three files have left — `003-upfronts.json`, `004-tech-keynotes.json` and
 * `005-variety.json`. Every record in each now carries citations through the 019 overlay,
 * which `sourcesBySlug` sees. Removing a file from this set is the only thing that proves the
 * backfill actually finished, because the warning it emits otherwise never stops being true
 * on its own.
 */
const LEGACY_UNSOURCED = new Set([
  "000-session1-smoke.json",
  "001-award-shows.json",
  "002-game-shows.json",
  "006-production-team.json",
]);

const errors: Problem[] = [];
const warnings: Problem[] = [];

function error(file: string, record: string, message: string) {
  errors.push({ file, record, message });
}
function warn(file: string, record: string, message: string) {
  warnings.push({ file, record, message });
}
/** Time-sensitive findings: a defect while authoring, a calendar fact afterwards. */
const timeSensitive = STRICT ? error : warn;

// ---------------------------------------------------------------------------
// Per-record checks
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function hasOfficial(sources: SourceLike[]): boolean {
  return sources.some((s) => s.tier === "official");
}

/** Whole days between two ISO dates. Both are UTC midnight, so no DST correction is needed. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

function checkDates(file: string, name: string, label: string, e: Record<string, unknown>) {
  const dateFields = [
    "start_date",
    "end_date",
    "load_in",
    "tech_rehearsal",
    "dress_rehearsal",
    "show_date",
    "strike",
  ] as const;

  for (const field of dateFields) {
    const value = e[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !ISO_DATE.test(value)) {
      error(file, name, `${label}.${field} is not an ISO date: ${JSON.stringify(value)}`);
      continue;
    }
    // Catches 2026-13-01 and 2026-02-30, which the regex happily accepts.
    if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      error(file, name, `${label}.${field} is not a real calendar date: ${value}`);
    }
  }

  const start = typeof e.start_date === "string" ? e.start_date : null;
  const end = typeof e.end_date === "string" ? e.end_date : null;
  if (start && end && end < start) {
    error(file, name, `${label} ends before it starts (${start} → ${end})`);
  }

  const year = typeof e.year === "number" ? e.year : null;
  if (year !== null && start && Number(start.slice(0, 4)) !== year) {
    // Not an error: a January edition of a season that opened in December is real, and so
    // is a taping window that straddles New Year. It is almost always a typo, though.
    warn(file, name, `${label} year ${year} does not match start_date ${start}`);
  }

  // The production timeline must run forwards. Only compares fields that are present —
  // most editions carry none of these, and an absent field is "unknown", not "zero".
  const timeline = [
    ["load_in", e.load_in],
    ["tech_rehearsal", e.tech_rehearsal],
    ["dress_rehearsal", e.dress_rehearsal],
    ["show_date", e.show_date],
    ["strike", e.strike],
  ].filter((pair): pair is [string, string] => typeof pair[1] === "string");

  for (let i = 1; i < timeline.length; i += 1) {
    const [prevName, prev] = timeline[i - 1];
    const [currName, curr] = timeline[i];
    if (curr < prev) {
      error(file, name, `${label} timeline runs backwards: ${prevName} ${prev} → ${currName} ${curr}`);
    }
  }
}

/**
 * Every source any file contributes to a given production slug.
 *
 * Built once and consulted by the provenance check, because the importer merges overlays by
 * slug and the database therefore ends up with the union. Without this, the batch 019
 * backfill could never actually retire a file from `LEGACY_UNSOURCED`: the citations land in
 * 019, the bare record stays in 004, and a per-file check would keep calling 004 unsourced
 * forever while the database had every citation it needed.
 *
 * Only the "is this backed at all" question reads across files. The rules that make a
 * specific claim — a confirmed future edition needing an official source — stay per-record,
 * because a source attached to a different year is not evidence for this one.
 */
const sourcesBySlug = new Map<string, SourceLike[]>();

/**
 * The same union, but keyed `slug:year`.
 *
 * The confirmed-future-edition rule needs this granularity and not the looser one. A source
 * proving the 2026 date says nothing about 2027, so "does this record have sources somewhere"
 * is the wrong question for it — but "does this production-year have an official source in
 * any file" is exactly right, because that is what the database ends up holding.
 */
const sourcesBySlugYear = new Map<string, SourceLike[]>();

function indexSources(loaded: Loaded[]) {
  for (const { record } of loaded) {
    const name = typeof record.name === "string" ? record.name : null;
    if (!name) continue;
    const slug = typeof record.slug === "string" ? record.slug : slugify(name);

    const found = allSourcesOf(record);
    if (found.length > 0) {
      sourcesBySlug.set(slug, [...(sourcesBySlug.get(slug) ?? []), ...found]);
    }

    for (const edition of editionsOf(record)) {
      const editionSources = sourcesOf(edition.sources);
      if (editionSources.length === 0) continue;
      const key = `${slug}:${edition.year}`;
      sourcesBySlugYear.set(key, [...(sourcesBySlugYear.get(key) ?? []), ...editionSources]);
    }
  }
}

function checkRecord({ file, index, record }: Loaded) {
  const name = typeof record.name === "string" ? record.name : `#${index}`;

  // The importer's own validator, run here so a strict-object failure surfaces at the file
  // rather than as one line in a 207 response after half the batch has landed.
  const parsed = ProductionInput.safeParse(record);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      error(file, name, path ? `${path}: ${issue.message}` : issue.message);
    }
    return;
  }

  const slug = typeof record.slug === "string" ? record.slug : slugify(name);
  const productionSources = sourcesOf(record.sources);
  const editions = editionsOf(record);
  const editionSources = editions.flatMap((e) => sourcesOf(e.sources));
  const teamSources = Array.isArray(record.team)
    ? (record.team as Record<string, unknown>[]).flatMap((t) => sourcesOf(t.sources))
    : [];
  const viewershipSources = Array.isArray(record.viewership)
    ? (record.viewership as Record<string, unknown>[]).flatMap((v) => sourcesOf(v.sources))
    : [];

  const allSources = [
    ...productionSources,
    ...editionSources,
    ...teamSources,
    ...viewershipSources,
  ];

  // Legacy batches carry no citations by construction — see LEGACY_UNSOURCED. Reporting them
  // as warnings keeps the backfill visible without making the gate permanently red.
  const legacy = LEGACY_UNSOURCED.has(file);
  const sourceProblem = legacy ? warn : error;

  const backfilled = (sourcesBySlug.get(slug) ?? []).length > 0;

  if (allSources.length === 0 && !backfilled) {
    sourceProblem(
      file,
      name,
      legacy
        ? "predates provenance — awaiting the batch 019 source backfill"
        : "no sources anywhere on the record — every seeded fact needs provenance",
    );
  } else if (allSources.length === 0) {
    // Backed by an overlay in another file. The database will hold the union, so this is
    // sourced — but a reader of this file alone cannot tell, which is worth one line.
    warn(file, name, "no sources in this file; backed by an overlay batch");
  } else if (productionSources.length === 0) {
    warn(file, name, "no production-level source; only per-edition facts are backed");
  }

  // The gate that makes `status: confirmed` mean something. A future date is the one fact a
  // freelancer will act on, so it needs the party who decides it — not a trade report of it.
  for (const e of editions) {
    const label = `edition ${e.year ?? "?"}`;
    checkDates(file, name, label, e);

    const start = typeof e.start_date === "string" ? e.start_date : null;
    const isFuture = start !== null && start >= TODAY;
    const editionSourceList = sourcesOf(e.sources);

    // Sources for this exact production-year, from any file — an overlay batch citing
    // "ces 2027" backs this edition just as the database will see it.
    const yearSources = [
      ...editionSourceList,
      ...(sourcesBySlugYear.get(`${slug}:${e.year}`) ?? []),
    ];

    if (e.status === "confirmed" && isFuture && !hasOfficial(yearSources)) {
      sourceProblem(
        file,
        name,
        `${label} is confirmed for ${start} with no official-tier source — ` +
          "downgrade it to announced or cite the primary source",
      );
    }
    if (isFuture && yearSources.length === 0 && !legacy) {
      warn(file, name, `${label} is upcoming (${start}) with no source of its own`);
    }

    /**
     * A completed edition whose date has not arrived.
     *
     * Unconditionally an error, and the highest-value check in this pass. It is exactly the
     * failure `seeds/PROGRESS.md` records: aggregator pages auto-generate a page per year
     * and describe next year's event in the past tense, with a date. A record that says an
     * event both already happened and has not happened yet is not stale — it is wrong.
     */
    if (e.status === "completed" && isFuture) {
      error(file, name, `${label} is marked completed but ${start} has not happened yet`);
    }

    /**
     * The mirror image: a confirmed or announced edition whose date has gone by.
     *
     * "Has it started" is the wrong question — the right one is "has it finished". A
     * season-long package is one edition with a real opening date in the past and months
     * still to run, and `confirmed` is exactly the right status for it while it is on air.
     * Batch 011 is where this surfaced: MLS on Apple TV opens in February and ends in
     * December, and flagging it in August would be reporting that a season in progress is
     * stale data.
     *
     * So an edition is only late if it has an `end_date` that has also passed, or no
     * `end_date` at all. A running season with no end date still warns — that is a genuine
     * gap in the record rather than a false positive.
     */
    const end = typeof e.end_date === "string" ? e.end_date : null;
    const stillRunning = end !== null && end >= TODAY;
    if (
      (e.status === "confirmed" || e.status === "announced") &&
      start !== null &&
      start < TODAY &&
      !stillRunning
    ) {
      timeSensitive(
        file,
        name,
        end === null
          ? `${label} is still "${e.status}", ${start} has passed, and it has no end_date — ` +
              "a season still running and a record gone stale look identical without one"
          : `${label} is still "${e.status}" but it ended ${end}`,
      );
    }

    /**
     * An upcoming edition whose newest citation is old.
     *
     * A date confirmed against a page that has since changed reads as checked and is not,
     * which is worse than an honest gap. Scoped to future editions: pass 4 is the one that
     * goes stale, because it is the only one whose subject can still move.
     */
    if (isFuture && editionSourceList.length > 0) {
      const newest = editionSourceList
        .map((s) => (typeof s.retrieved_on === "string" ? s.retrieved_on : ""))
        .reduce((latest, value) => (value > latest ? value : latest), "");
      if (newest !== "" && daysBetween(newest, TODAY) > STALE_AFTER_DAYS) {
        warn(
          file,
          name,
          `${label} is upcoming (${start}) and its newest citation was read ` +
            `${daysBetween(newest, TODAY)} days ago — re-run pass 4`,
        );
      }
    }
  }

  for (const s of allSources) {
    const url = typeof s.url === "string" ? s.url : null;
    if (url !== null && !/^https?:\/\//i.test(url)) {
      error(file, name, `source url is not http(s): ${url}`);
    }

    /**
     * `official` means the party that decides the fact said so. An encyclopedia or a fan
     * wiki cannot be that party by definition, and a batch that tiers one `official` has
     * mislabelled it — usually by copying the tier from the row above. Left unchecked it is
     * the one way a reference source reaches the `official` confidence tier.
     */
    if (url !== null && s.tier === "official" && isReferenceDomain(url)) {
      error(
        file,
        name,
        `${registrableDomain(url)} is a reference source and cannot be official-tier: ${url}`,
      );
    }

    // Dates that describe reading a page. Each of these is impossible rather than unlikely,
    // and an impossible retrieval date is the cheapest fabrication tell there is.
    const retrieved = typeof s.retrieved_on === "string" ? s.retrieved_on : null;
    const published = typeof s.published_on === "string" ? s.published_on : null;

    if (retrieved !== null && retrieved > TODAY) {
      error(file, name, `source retrieved_on is in the future (${retrieved}): ${url}`);
    }
    if (published !== null && published > TODAY) {
      error(file, name, `source published_on is in the future (${published}): ${url}`);
    }
    if (retrieved !== null && published !== null && published > retrieved) {
      error(
        file,
        name,
        `source was published ${published} but retrieved ${retrieved} — read before it existed: ${url}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-file checks
// ---------------------------------------------------------------------------

/**
 * Slug hygiene, at two different severities.
 *
 * The same slug in two DIFFERENT files is the intended overlay: batch 006 re-cites
 * `grammy-awards` to hang team credits on a production batch 001 already created, and every
 * write is keyed on the slug precisely so that converges instead of duplicating. Not a
 * finding at all.
 *
 * The same slug TWICE IN ONE FILE is a real bug — both records land in one upsert pass and
 * the second silently overwrites the first, so half the research disappears with no error.
 *
 * Two slugs ONE EDIT APART are two rows that should have been one. That is the fork
 * `orphanLookups` catches on /admin only after the import has already created it.
 */
function checkCollisions(loaded: Loaded[]) {
  const bySlug = new Map<string, Loaded[]>();
  for (const item of loaded) {
    const name = typeof item.record.name === "string" ? item.record.name : null;
    if (!name) continue;
    const slug = typeof item.record.slug === "string" ? item.record.slug : slugify(name);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), item]);
  }

  for (const [slug, items] of bySlug) {
    if (items.length < 2) continue;
    const byFile = new Map<string, number[]>();
    for (const item of items) {
      byFile.set(item.file, [...(byFile.get(item.file) ?? []), item.index]);
    }
    for (const [file, indexes] of byFile) {
      if (indexes.length < 2) continue;
      error(
        file,
        slug,
        `slug appears ${indexes.length} times in this file (records ${indexes.join(", ")}) — ` +
          "the later record overwrites the earlier one",
      );
    }
  }

  const slugs = [...bySlug.keys()].sort();
  for (let i = 0; i < slugs.length; i += 1) {
    for (let j = i + 1; j < slugs.length; j += 1) {
      // Only compare neighbours in sorted order plus a small window; a full O(n^2) over 800
      // slugs is fine, but near-duplicates are overwhelmingly adjacent once sorted.
      if (j > i + 4) break;
      if (editDistanceAtMostOne(slugs[i], slugs[j])) {
        warn("seeds", slugs[i], `one edit away from "${slugs[j]}" — same production?`);
      }
    }
  }
}

/** True when the two strings differ by at most one insert, delete or substitution. */
function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) i += 1;
    j += 1;
  }
  return true;
}

/**
 * Publisher identity, now that corroboration counts domains rather than labels.
 *
 * Three findings, at two severities:
 *
 *  - **One domain cited at two different tiers** is an error. `tier` is what gates the
 *    `official` confidence level, so a site that is `official` in one record and `trade` in
 *    the next means one of them is wrong, and the wrong one is load-bearing. Every host in
 *    the corpus maps to exactly one tier today, so this lands green and stays a real gate.
 *  - **One domain under two publisher labels** is a warning, not an error. `mlb.com`
 *    legitimately carries both MLB's newsroom and the Cubs', and both are `official` for
 *    different facts. Under domain-keyed counting the labels can no longer inflate anything,
 *    which drops this from a gate to hygiene — worth seeing, not worth blocking.
 *  - **One label across two domains** is a warning: either an outlet that genuinely publishes
 *    from two places (a `PUBLISHER_GROUPS` entry, and a re-derive), or a typo.
 */
function checkPublisherIdentity(loaded: Loaded[]) {
  const tiers = new Map<string, Map<string, string[]>>();
  const labels = new Map<string, Set<string>>();
  const domains = new Map<string, Set<string>>();

  for (const { file, record } of loaded) {
    const name = typeof record.name === "string" ? record.name : "?";
    for (const source of allSourcesOf(record)) {
      if (typeof source.url !== "string") continue;
      const domain = registrableDomain(source.url);
      if (domain === null) continue;

      const publisher = typeof source.publisher === "string" ? source.publisher : "?";
      const tier = typeof source.tier === "string" ? source.tier : "?";

      const byTier = tiers.get(domain) ?? new Map<string, string[]>();
      byTier.set(tier, [...(byTier.get(tier) ?? []), `${file} — ${name}`]);
      tiers.set(domain, byTier);

      labels.set(domain, (labels.get(domain) ?? new Set()).add(publisher));
      domains.set(publisher, (domains.get(publisher) ?? new Set()).add(domain));
    }
  }

  for (const [domain, byTier] of tiers) {
    if (byTier.size < 2) continue;
    const detail = [...byTier]
      .map(([tier, where]) => `${tier} (${where[0]}${where.length > 1 ? ` +${where.length - 1}` : ""})`)
      .join(" vs ");
    error("seeds", domain, `cited at more than one tier — ${detail}. One of them is wrong.`);
  }

  for (const [domain, names] of labels) {
    if (names.size < 2) continue;
    warn("seeds", domain, `one domain, ${names.size} publisher labels: ${[...names].join(" / ")}`);
  }

  for (const [publisher, hosts] of domains) {
    if (hosts.size < 2) continue;
    warn(
      "seeds",
      publisher,
      `one publisher label, ${hosts.size} domains: ${[...hosts].join(" / ")} — ` +
        "corroboration counts them separately unless PUBLISHER_GROUPS says otherwise",
    );
  }
}

/**
 * The fork that concurrent batch authoring actually produces.
 *
 * `checkCollisions` covers production slugs. Lookups had nothing: batch 011 writes
 * `{"name": "Netflix"}`, batch 014 writes `{"name": "Netflix (US)"}`, and the result is two
 * network rows, two sets of productions hanging off them, and no error anywhere — because
 * both are perfectly valid records. `orphanLookups` on /admin only notices after the import
 * has already created the fork, and only if one side ends up referenced by nothing.
 *
 * This is the check that makes researching several batches at once safe. Run
 * `npm run seeds:lookups` to see the vocabulary already in the database before writing one.
 */
function checkLookupNames(loaded: Loaded[]) {
  /** kind -> slug -> the distinct names written under it, and where. */
  const byKind = new Map<string, Map<string, Map<string, Set<string>>>>();

  const note = (kind: string, value: unknown, where: string) => {
    if (typeof value === "string") return record(kind, value, where);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    const name = (value as { name?: unknown }).name;
    const slug = (value as { slug?: unknown }).slug;
    if (typeof name !== "string") return;
    record(kind, name, where, typeof slug === "string" ? slug : undefined);
    // A venue can carry its own city object.
    if (kind === "venue") note("city", (value as { city?: unknown }).city, where);
  };

  const record = (kind: string, name: string, where: string, explicitSlug?: string) => {
    const slug = explicitSlug ?? slugify(name);
    const kindMap = byKind.get(kind) ?? new Map<string, Map<string, Set<string>>>();
    const slugMap = kindMap.get(slug) ?? new Map<string, Set<string>>();
    slugMap.set(name, (slugMap.get(name) ?? new Set()).add(where));
    kindMap.set(slug, slugMap);
    byKind.set(kind, kindMap);
  };

  for (const { file, record: row } of loaded) {
    const where = file;
    note("network", row.network, where);
    note("company", row.production_company, where);
    note("city", row.city, where);
    note("venue", row.venue, where);

    for (const edition of editionsOf(row)) {
      note("city", edition.city, where);
      note("venue", edition.venue, where);
      note("network", edition.network, where);
    }
    if (Array.isArray(row.team)) {
      for (const member of row.team as Record<string, unknown>[]) {
        note("company", member.company, where);
      }
    }
  }

  for (const [kind, kindMap] of byKind) {
    // Two names under one slug is harmless — the importer keys on the slug, so they converge
    // and the LAST one wins the `name` column. Worth seeing, because which one wins is
    // decided by file order rather than by anyone.
    for (const [slug, names] of kindMap) {
      if (names.size < 2) continue;
      warn(
        "seeds",
        `${kind}:${slug}`,
        `same slug, different names: ${[...names.keys()].map((n) => `"${n}"`).join(" vs ")} — ` +
          "the last file imported wins",
      );
    }

    // Two slugs one edit apart is the real fork: two rows that should have been one.
    const slugs = [...kindMap.keys()].sort();
    for (let i = 0; i < slugs.length; i += 1) {
      for (let j = i + 1; j < slugs.length && j <= i + 4; j += 1) {
        if (!editDistanceAtMostOne(slugs[i], slugs[j])) continue;
        warn(
          "seeds",
          `${kind}:${slugs[i]}`,
          `one edit away from "${slugs[j]}" — two ${kind} rows that should be one?`,
        );
      }
    }
  }
}

/**
 * `subcategory` is free text by design, which is exactly why it drifts. "late night" and
 * "late-night" are two facets in the browse table and one concept in the world.
 */
function checkSubcategories(loaded: Loaded[]) {
  const seen = new Map<string, number>();
  for (const { record } of loaded) {
    const sub = record.subcategory;
    if (typeof sub !== "string" || sub.trim() === "") continue;
    seen.set(sub, (seen.get(sub) ?? 0) + 1);
  }

  const values = [...seen.keys()].sort();
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      if (slugify(a) === slugify(b) || editDistanceAtMostOne(slugify(a), slugify(b))) {
        warn("seeds", "subcategory", `"${a}" (${seen.get(a)}) vs "${b}" (${seen.get(b)}) — pick one`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function main() {
  const { loaded, errors: loadErrors } = loadSeedRecords();
  errors.push(...loadErrors);

  if (loaded.length === 0 && errors.length === 0) {
    console.log("No seed records found.");
    return;
  }

  // Index first: the provenance check reads sources contributed by overlay batches.
  indexSources(loaded);
  for (const item of loaded) checkRecord(item);
  checkCollisions(loaded);
  checkLookupNames(loaded);
  checkPublisherIdentity(loaded);
  checkSubcategories(loaded);

  const files = new Set(loaded.map((l) => l.file)).size;
  // Records and productions are different numbers once overlay batches exist, and the gap is
  // the backfill's size. Printing both stops the larger one being read as progress.
  const distinct = new Set(
    loaded
      .map(({ record }) => {
        const name = typeof record.name === "string" ? record.name : null;
        if (!name) return null;
        return typeof record.slug === "string" ? record.slug : slugify(name);
      })
      .filter((s): s is string => s !== null),
  ).size;

  console.log(
    `Checked ${loaded.length} records across ${files} files — ` +
      `${distinct} distinct productions after overlays.\n`,
  );

  /**
   * Counted by distinct slug, not by record.
   *
   * An overlay batch re-states a production to add citations to it, so counting records
   * double-counts every backfilled row: `variety` read 16 against a target of 40 the moment
   * batch 019 cited its eight shows, and eight of those sixteen were the same eight shows.
   * The number that matters is what the database will hold, and the database holds one row
   * per slug — this table is read as progress against a target, so it has to agree with it.
   */
  const categoryBySlug = new Map<string, string>();
  const statusTally = new Map<string, number>(STATUSES.map((s) => [s, 0]));
  for (const { record } of loaded) {
    const name = typeof record.name === "string" ? record.name : null;
    const category = record.category;
    if (name && typeof category === "string") {
      const slug = typeof record.slug === "string" ? record.slug : slugify(name);
      categoryBySlug.set(slug, category);
    }
    for (const e of editionsOf(record)) {
      const status = typeof e.status === "string" ? e.status : "rumored";
      statusTally.set(status, (statusTally.get(status) ?? 0) + 1);
    }
  }

  const categoryTally = new Map<string, number>(CATEGORIES.map((c) => [c, 0]));
  for (const category of categoryBySlug.values()) {
    categoryTally.set(category, (categoryTally.get(category) ?? 0) + 1);
  }

  // The plan's per-category targets have to keep adding up to the headline number, or a
  // category can drift out of scope with nothing to notice. Cheap, and it fails loudly.
  const targetSum = Object.values(CATEGORY_TARGETS).reduce((a, b) => a + b, 0);
  if (targetSum !== SEED_TARGETS.productions) {
    error(
      "src/lib/stats.ts",
      "CATEGORY_TARGETS",
      `sums to ${targetSum} but SEED_TARGETS.productions is ${SEED_TARGETS.productions}`,
    );
  }

  console.log("By category:");
  for (const [category, count] of categoryTally) {
    const target = CATEGORY_TARGETS[category as (typeof CATEGORIES)[number]] ?? 0;
    console.log(
      `  ${category.padEnd(15)} ${String(count).padStart(4)} / ${String(target).padStart(3)}`,
    );
  }
  console.log("\nBy edition status:");
  for (const [status, count] of statusTally) {
    console.log(`  ${status.padEnd(15)} ${String(count).padStart(4)}`);
  }

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ${w.file} — ${w.record}: ${w.message}`);
  }

  if (errors.length > 0) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log(`  ${e.file} — ${e.record}: ${e.message}`);
    console.log("\nFix these before importing.");
    process.exit(1);
  }

  console.log("\nNo errors. Safe to import.");
}

main();
