/**
 * Reading the seed corpus, shared by `check-seeds.ts` and `check-links.ts`.
 *
 * Both scripts need the same three things — the files, the editions in whichever of the two
 * accepted shapes a record used, and every source hanging off a record regardless of what it
 * backs. Duplicating that would mean the link checker could drift into checking a different
 * set of URLs from the one the validator sees, which is the one way a provenance gate fails
 * quietly.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const SEEDS_DIR = join(process.cwd(), "seeds");

export type Loaded = { file: string; index: number; record: Record<string, unknown> };
export type Problem = { file: string; record: string; message: string };

export type SourceLike = {
  url?: unknown;
  publisher?: unknown;
  tier?: unknown;
  retrieved_on?: unknown;
  published_on?: unknown;
  field?: unknown;
};

/**
 * Every `*.json` directly inside the seeds directory.
 *
 * Not recursive, and that is load-bearing rather than incidental: `seeds/candidates/` holds
 * Wikidata discovery output, which is a different shape entirely and must never reach the
 * validator or the importer. A candidate is a lead, not a record.
 */
export function loadSeedRecords(dir: string = SEEDS_DIR): { loaded: Loaded[]; errors: Problem[] } {
  const errors: Problem[] = [];
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return { loaded: [], errors: [{ file: dir, record: "-", message: "no seeds directory" }] };
  }

  const loaded: Loaded[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (cause) {
      errors.push({
        file,
        record: "-",
        message: `not valid JSON: ${cause instanceof Error ? cause.message : cause}`,
      });
      continue;
    }
    if (!Array.isArray(parsed)) {
      errors.push({ file, record: "-", message: "top level is not a JSON array" });
      continue;
    }
    parsed.forEach((record, index) => {
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        errors.push({ file, record: `#${index}`, message: "record is not an object" });
        return;
      }
      loaded.push({ file, index, record: record as Record<string, unknown> });
    });
  }
  return { loaded, errors };
}

export function sourcesOf(value: unknown): SourceLike[] {
  return Array.isArray(value) ? (value as SourceLike[]) : [];
}

/**
 * Editions arrive in two shapes — the nested array, or the flat single-edition shorthand
 * written on the production. Collapsing them here mirrors `normalizeEditions` in the
 * importer so the checks see exactly what the database will.
 */
export function editionsOf(record: Record<string, unknown>): Record<string, unknown>[] {
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

/** Every source on a record, whatever it backs: the production, an edition, a credit, a rating. */
export function allSourcesOf(record: Record<string, unknown>): SourceLike[] {
  const nested = (key: string) =>
    Array.isArray(record[key])
      ? (record[key] as Record<string, unknown>[]).flatMap((row) => sourcesOf(row.sources))
      : [];

  return [
    ...sourcesOf(record.sources),
    ...editionsOf(record).flatMap((e) => sourcesOf(e.sources)),
    ...nested("team"),
    ...nested("viewership"),
  ];
}
