import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { CATEGORIES, CONFIDENCE_LEVELS, STATUSES } from "@/lib/import/schema";

type Db = SupabaseClient<Database>;

/** Content tables that seeding actually fills. profiles/favorites stay empty until Phase 2. */
const COUNTED = [
  "productions",
  "editions",
  "viewership",
  "cities",
  "networks",
  "companies",
  "venues",
  "sources",
  "citations",
] as const;

type CountedTable = (typeof COUNTED)[number];

/**
 * Phase 0 ship criteria from LIVEGRID_PLAN.md — what "done" means for the seed.
 *
 * Raised from 250/400/100 for the deep sweep: the original target predates sports, concerts,
 * holiday, reality, streaming, political, gaming and international having any rows at all,
 * and `sports` alone is worth most of the old total.
 */
export const SEED_TARGETS = { productions: 800, editions: 1600, viewership: 300 } as const;

export type SeedStats = {
  counts: Record<CountedTable, number>;
  targets: typeof SEED_TARGETS;
  byCategory: { category: string; count: number }[];
  byStatus: { status: string; count: number }[];
  /**
   * Productions by derived confidence. This is the sweep's real progress bar — a category
   * can look full while every row in it is a single unchecked source.
   */
  byConfidence: { confidence: string; count: number }[];
  /**
   * Productions carrying no citation at all, oldest-verified first among those that have
   * one. During the backfill this is the work queue; after it, anything appearing here is a
   * record that landed without provenance and needs a pass.
   */
  unverified: { name: string; slug: string; category: string }[];
  /**
   * Verified records, least recently checked first. A date confirmed two years ago against
   * a page that has since changed is worse than an honest gap, because it reads as checked.
   */
  staleVerification: { name: string; slug: string; verifiedOn: string; confidence: string }[];
  productions: {
    name: string;
    slug: string;
    category: string;
    scale: number | null;
    network: string | null;
    company: string | null;
    confidence: string;
    verifiedOn: string | null;
    editions: { year: number; status: string; startDate: string | null; city: string | null }[];
    viewershipYears: number[];
  }[];
  /** Lookup rows nothing points at — usually a near-duplicate created by a typo. */
  orphanLookups: { kind: string; name: string; slug: string }[];
  /**
   * Distinct person names on production_team, with a use count.
   *
   * Unlike every other name in the database these have no slug and therefore no dedupe:
   * "Ben Winston" and "Ben Winson" are two people as far as Postgres is concerned. Listing
   * them for spot-check is the same safety net orphanLookups provides for cities and
   * networks, and it is the only one free text can have.
   */
  teamNames: { name: string; count: number }[];
};

async function countOf(db: Db, table: CountedTable): Promise<number> {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`count(${table}) failed: ${error.message}`);
  return count ?? 0;
}

/**
 * One read used by both /admin and GET /api/admin/stats, so the page and the endpoint can
 * never drift apart (AGENTS.md rule 3). Runs on the anon client — everything here is
 * public content, so RLS applies and no service-role key is involved.
 */
export async function getSeedStats(db: Db): Promise<SeedStats> {
  const countEntries = await Promise.all(
    COUNTED.map(async (table) => [table, await countOf(db, table)] as const),
  );
  const counts = Object.fromEntries(countEntries) as Record<CountedTable, number>;

  const { data: rows, error } = await db
    .from("productions")
    // Must stay a single string literal — Supabase parses the select at the type level,
    // and a concatenation widens to `string`, collapsing every joined column to an error.
    .select(
      "name, slug, category, production_scale, confidence, verified_on, networks(name), companies(name), editions(year, status, start_date, cities(name)), viewership(year)",
    )
    .order("name");
  if (error) throw new Error(`productions overview failed: ${error.message}`);

  const productions = (rows ?? []).map((row) => ({
    name: row.name,
    slug: row.slug,
    category: row.category,
    scale: row.production_scale,
    network: row.networks?.name ?? null,
    company: row.companies?.name ?? null,
    confidence: row.confidence,
    verifiedOn: row.verified_on,
    editions: (row.editions ?? [])
      .map((e) => ({
        year: e.year,
        status: e.status,
        startDate: e.start_date,
        city: e.cities?.name ?? null,
      }))
      .sort((a, b) => a.year - b.year),
    viewershipYears: (row.viewership ?? []).map((v) => v.year).sort((a, b) => a - b),
  }));

  // Categories and statuses come from the schema constants, so a batch that has not been
  // seeded yet still shows as a zero row rather than vanishing from the list.
  const categoryTally = new Map<string, number>(CATEGORIES.map((c) => [c, 0]));
  for (const p of productions) {
    categoryTally.set(p.category, (categoryTally.get(p.category) ?? 0) + 1);
  }

  const statusTally = new Map<string, number>(STATUSES.map((s) => [s, 0]));
  for (const p of productions) {
    for (const e of p.editions) statusTally.set(e.status, (statusTally.get(e.status) ?? 0) + 1);
  }

  const confidenceTally = new Map<string, number>(CONFIDENCE_LEVELS.map((c) => [c, 0]));
  for (const p of productions) {
    confidenceTally.set(p.confidence, (confidenceTally.get(p.confidence) ?? 0) + 1);
  }

  return {
    counts,
    targets: SEED_TARGETS,
    byCategory: [...categoryTally].map(([category, count]) => ({ category, count })),
    byStatus: [...statusTally].map(([status, count]) => ({ status, count })),
    byConfidence: [...confidenceTally].map(([confidence, count]) => ({ confidence, count })),
    unverified: productions
      .filter((p) => p.confidence === "unverified")
      .map((p) => ({ name: p.name, slug: p.slug, category: p.category })),
    staleVerification: productions
      .filter((p): p is typeof p & { verifiedOn: string } => p.verifiedOn !== null)
      .sort((a, b) => a.verifiedOn.localeCompare(b.verifiedOn))
      .slice(0, 12)
      .map((p) => ({
        name: p.name,
        slug: p.slug,
        verifiedOn: p.verifiedOn,
        confidence: p.confidence,
      })),
    productions,
    orphanLookups: await findOrphanLookups(db),
    teamNames: await findTeamNames(db),
  };
}

async function findTeamNames(db: Db): Promise<SeedStats["teamNames"]> {
  const { data, error } = await db.from("production_team").select("person_name");
  if (error) throw new Error(`team names failed: ${error.message}`);

  const tally = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.person_name) continue;
    tally.set(row.person_name, (tally.get(row.person_name) ?? 0) + 1);
  }
  return [...tally]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Lookup rows referenced by nothing. During seeding these are almost always a name
 * variant that forked a row ("CBS" alongside "CBS Sports"), which is exactly the failure
 * the import report's createdLookups is meant to catch — this is the standing check.
 */
async function findOrphanLookups(db: Db): Promise<SeedStats["orphanLookups"]> {
  const [networks, companies, cities, venues, productions, editions, team] = await Promise.all([
    db.from("networks").select("name, slug, id"),
    db.from("companies").select("name, slug, id"),
    db.from("cities").select("name, slug, id"),
    db.from("venues").select("name, slug, id, city_id"),
    db.from("productions").select("network_id, production_company_id"),
    db.from("editions").select("city_id, venue_id, network_id"),
    db.from("production_team").select("company_id"),
  ]);

  /**
   * Every FK that points at a network or a company, not just the one on `productions`.
   *
   * Both of these columns were missed originally, and the omission got louder as the data
   * grew: a network used ONLY per-edition (the Super Bowl has no default broadcaster — it
   * rotates, so ABC and NBC live on the editions) and a company credited only through
   * `production_team` (a vendor is never a `production_company_id`) were both reported as
   * unreferenced. A duplicate-detector that cries wolf is one people stop reading.
   */
  const usedNetworks = new Set([
    ...(productions.data ?? []).map((p) => p.network_id),
    ...(editions.data ?? []).map((e) => e.network_id),
  ]);
  const usedCompanies = new Set([
    ...(productions.data ?? []).map((p) => p.production_company_id),
    ...(team.data ?? []).map((t) => t.company_id),
  ]);
  const usedCities = new Set([
    ...(editions.data ?? []).map((e) => e.city_id),
    ...(venues.data ?? []).map((v) => v.city_id),
  ]);
  const usedVenues = new Set((editions.data ?? []).map((e) => e.venue_id));

  const orphans: SeedStats["orphanLookups"] = [];
  const collect = (
    kind: string,
    rows: { name: string; slug: string; id: string }[] | null,
    used: Set<string | null>,
  ) => {
    for (const row of rows ?? []) {
      if (!used.has(row.id)) orphans.push({ kind, name: row.name, slug: row.slug });
    }
  };

  collect("network", networks.data, usedNetworks);
  collect("company", companies.data, usedCompanies);
  collect("city", cities.data, usedCities);
  collect("venue", venues.data, usedVenues);
  return orphans;
}
