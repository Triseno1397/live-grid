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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { CATEGORIES, ProductionInput, STATUSES } from "../src/lib/import/schema";
import { slugify } from "../src/lib/slug";

const SEEDS_DIR = join(process.cwd(), "seeds");

/** Today in the same ISO form the seeds use, in UTC so the check is machine-independent. */
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Batches imported before the provenance migration existed. Their facts were verified — the
 * commit messages for each are unusually detailed about how — but the citations were never
 * written down anywhere a machine can read.
 *
 * Listed explicitly rather than tolerated silently so the debt is visible in code and the
 * gate stays live for everything new. Batch 019 backfills these and empties this array; a
 * file only earns a place here by predating the schema, never by being in a hurry.
 */
const LEGACY_UNSOURCED = new Set([
  "000-session1-smoke.json",
  "001-award-shows.json",
  "002-game-shows.json",
  "003-upfronts.json",
  "004-tech-keynotes.json",
  "005-variety.json",
  "006-production-team.json",
]);

type Problem = { file: string; record: string; message: string };

const errors: Problem[] = [];
const warnings: Problem[] = [];

function error(file: string, record: string, message: string) {
  errors.push({ file, record, message });
}
function warn(file: string, record: string, message: string) {
  warnings.push({ file, record, message });
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

type Loaded = { file: string; index: number; record: Record<string, unknown> };

function loadAll(): Loaded[] {
  let files: string[];
  try {
    files = readdirSync(SEEDS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    console.error(`No seeds directory at ${SEEDS_DIR}.`);
    process.exit(1);
  }

  const loaded: Loaded[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(SEEDS_DIR, file), "utf8"));
    } catch (cause) {
      error(file, "-", `not valid JSON: ${cause instanceof Error ? cause.message : cause}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      error(file, "-", "top level is not a JSON array");
      continue;
    }
    parsed.forEach((record, index) => {
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        error(file, `#${index}`, "record is not an object");
        return;
      }
      loaded.push({ file, index, record: record as Record<string, unknown> });
    });
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// Per-record checks
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SourceLike = { tier?: unknown; url?: unknown; publisher?: unknown };

function sourcesOf(value: unknown): SourceLike[] {
  return Array.isArray(value) ? (value as SourceLike[]) : [];
}

function hasOfficial(sources: SourceLike[]): boolean {
  return sources.some((s) => s.tier === "official");
}

/**
 * Editions arrive in two shapes — the nested array, or the flat single-edition shorthand
 * written on the production. Collapsing them here mirrors `normalizeEditions` in the
 * importer so the check sees exactly what the database will.
 */
function editionsOf(record: Record<string, unknown>): Record<string, unknown>[] {
  const nested = record.editions;
  if (Array.isArray(nested) && nested.length > 0) {
    return nested.filter(
      (e): e is Record<string, unknown> => typeof e === "object" && e !== null && !Array.isArray(e),
    );
  }
  if (record.year === undefined) return [];
  return [
    {
      year: record.year,
      status: record.status,
      start_date: record.start_date,
      end_date: record.end_date,
      sources: record.sources,
    },
  ];
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

  if (allSources.length === 0) {
    sourceProblem(
      file,
      name,
      legacy
        ? "predates provenance — awaiting the batch 019 source backfill"
        : "no sources anywhere on the record — every seeded fact needs provenance",
    );
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
    if (e.status === "confirmed" && isFuture && !hasOfficial(sourcesOf(e.sources))) {
      sourceProblem(
        file,
        name,
        `${label} is confirmed for ${start} with no official-tier source — ` +
          "downgrade it to announced or cite the primary source",
      );
    }
    if (isFuture && sourcesOf(e.sources).length === 0 && !legacy) {
      warn(file, name, `${label} is upcoming (${start}) with no source of its own`);
    }
  }

  for (const s of allSources) {
    if (typeof s.url === "string" && !/^https?:\/\//i.test(s.url)) {
      error(file, name, `source url is not http(s): ${s.url}`);
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
  const loaded = loadAll();
  if (loaded.length === 0 && errors.length === 0) {
    console.log("No seed records found.");
    return;
  }

  for (const item of loaded) checkRecord(item);
  checkCollisions(loaded);
  checkSubcategories(loaded);

  const files = new Set(loaded.map((l) => l.file)).size;
  console.log(`Checked ${loaded.length} records across ${files} files.\n`);

  const categoryTally = new Map<string, number>(CATEGORIES.map((c) => [c, 0]));
  const statusTally = new Map<string, number>(STATUSES.map((s) => [s, 0]));
  for (const { record } of loaded) {
    const category = record.category;
    if (typeof category === "string") {
      categoryTally.set(category, (categoryTally.get(category) ?? 0) + 1);
    }
    for (const e of editionsOf(record)) {
      const status = typeof e.status === "string" ? e.status : "rumored";
      statusTally.set(status, (statusTally.get(status) ?? 0) + 1);
    }
  }

  console.log("By category:");
  for (const [category, count] of categoryTally) {
    console.log(`  ${category.padEnd(15)} ${String(count).padStart(4)}`);
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
