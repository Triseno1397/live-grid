import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { CATEGORIES, STATUSES } from "@/lib/import/schema";

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
] as const;

type CountedTable = (typeof COUNTED)[number];

/** Phase 0 ship criteria from LIVEGRID_PLAN.md — what "done" means for the seed. */
export const SEED_TARGETS = { productions: 250, editions: 400, viewership: 100 } as const;

export type SeedStats = {
  counts: Record<CountedTable, number>;
  targets: typeof SEED_TARGETS;
  byCategory: { category: string; count: number }[];
  byStatus: { status: string; count: number }[];
  productions: {
    name: string;
    slug: string;
    category: string;
    scale: number | null;
    network: string | null;
    company: string | null;
    editions: { year: number; status: string; startDate: string | null; city: string | null }[];
    viewershipYears: number[];
  }[];
  /** Lookup rows nothing points at — usually a near-duplicate created by a typo. */
  orphanLookups: { kind: string; name: string; slug: string }[];
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
      "name, slug, category, production_scale, networks(name), companies(name), editions(year, status, start_date, cities(name)), viewership(year)",
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

  return {
    counts,
    targets: SEED_TARGETS,
    byCategory: [...categoryTally].map(([category, count]) => ({ category, count })),
    byStatus: [...statusTally].map(([status, count]) => ({ status, count })),
    productions,
    orphanLookups: await findOrphanLookups(db),
  };
}

/**
 * Lookup rows referenced by nothing. During seeding these are almost always a name
 * variant that forked a row ("CBS" alongside "CBS Sports"), which is exactly the failure
 * the import report's createdLookups is meant to catch — this is the standing check.
 */
async function findOrphanLookups(db: Db): Promise<SeedStats["orphanLookups"]> {
  const [networks, companies, cities, venues, productions, editions] = await Promise.all([
    db.from("networks").select("name, slug, id"),
    db.from("companies").select("name, slug, id"),
    db.from("cities").select("name, slug, id"),
    db.from("venues").select("name, slug, id, city_id"),
    db.from("productions").select("network_id, production_company_id"),
    db.from("editions").select("city_id, venue_id"),
  ]);

  const usedNetworks = new Set((productions.data ?? []).map((p) => p.network_id));
  const usedCompanies = new Set((productions.data ?? []).map((p) => p.production_company_id));
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
