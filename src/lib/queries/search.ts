import { unstable_cache } from "next/cache";

import { categoryLabel } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

import type { SearchHit } from "./types";

/** Per-group cap. The palette groups results by type, so one crowded group cannot bury another. */
const PER_GROUP = 6;

/**
 * How long the lookup corpus stays cached. Matches the page revalidate window — a venue
 * added through /admin/import shows up in search on the same schedule it shows up on a
 * city page, so the two can never look inconsistent to the same visitor.
 */
const CORPUS_TTL_SECONDS = 300;

/**
 * Turn raw palette input into a tsquery-safe prefix term.
 *
 * PostgREST's `fts` operator hands the string to `to_tsquery`, which throws on the
 * punctuation people type mid-search ("grammy'", "star:"). Stripping to words and
 * suffixing `:*` gives prefix matching, so results narrow while typing rather than
 * appearing only on the complete word.
 */
function toTsQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => `${w}:*`).join(" & ");
}

/**
 * Build a contains-pattern for `ilike`, stripping the characters that would otherwise be
 * read as syntax: `%` `_` `*` are pattern wildcards, and `"` `\` would break the quoting
 * applied in the `or` filter below.
 */
function toLikePattern(input: string): string {
  return `*${input.trim().replace(/[%_*"\\]/g, "")}*`;
}

/**
 * Quote a value for use inside PostgREST's `or=(...)`.
 *
 * `or` splits its arguments on commas, so an unquoted value containing one is a 400, not a
 * zero-result search — "country, music" would take the palette down. Quoting is only
 * needed inside `or`; a standalone `.ilike()` passes its value as its own query parameter.
 */
function quoted(value: string): string {
  return `"${value}"`;
}

type LookupCorpus = {
  venues: { name: string; slug: string; city: { name: string; slug: string; state: string | null } | null }[];
  cities: { name: string; slug: string; state: string | null }[];
  networks: { name: string; slug: string; isStreaming: boolean }[];
  companies: { name: string; slug: string; headquarters: string | null }[];
};

/**
 * Venues, cities, networks and companies, cached whole.
 *
 * Every request to Supabase costs ~150ms here regardless of how little it asks for —
 * measured: 9ms TCP, 36ms TLS, 156ms to first byte for `select name limit 1`. Searching
 * these four tables over the wire meant five round trips per keystroke to filter 45 rows
 * in total.
 *
 * They are proper nouns — "Atlanta", "CBS", "Fremantle" — with no prose to rank and no
 * stemming to do, so an in-memory contains-match is exactly what `ilike '%x%'` was already
 * doing. Productions keep their Postgres query below: that is where the description text
 * lives, and full text is the whole point of it.
 */
const getLookupCorpus = unstable_cache(
  async (): Promise<LookupCorpus> => {
    const db = createPublicClient();
    const [venues, cities, networks, companies] = await Promise.all([
      db.from("venues").select("name, slug, cities(name, slug, state)").order("name"),
      db.from("cities").select("name, slug, state").order("name"),
      db.from("networks").select("name, slug, is_streaming").order("name"),
      db.from("companies").select("name, slug, headquarters").order("name"),
    ]);

    const firstError = [venues, cities, networks, companies].find((r) => r.error)?.error;
    if (firstError) throw new Error(`search corpus failed: ${firstError.message}`);

    return {
      venues: (venues.data ?? []).map((v) => ({
        name: v.name,
        slug: v.slug,
        city: v.cities ? { name: v.cities.name, slug: v.cities.slug, state: v.cities.state } : null,
      })),
      cities: cities.data ?? [],
      networks: (networks.data ?? []).map((n) => ({
        name: n.name,
        slug: n.slug,
        isStreaming: n.is_streaming,
      })),
      companies: companies.data ?? [],
    };
  },
  ["search-lookup-corpus"],
  { revalidate: CORPUS_TTL_SECONDS, tags: ["search-corpus"] },
);

/** Case- and accent-insensitive contains, matching what `ilike '%x%'` did over the wire. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function contains(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(needle);
}

/**
 * Global search across productions, venues, cities, networks and companies.
 *
 * Productions are matched by Postgres: full text on name and description, plus a
 * trigram-backed `ilike` for the partial words and plurals people actually type
 * ("grammys" stems to Grammy Awards; "atlanta" hits via description prose). The four
 * lookup tables are matched in memory against the cached corpus above.
 *
 * See 20260811000000_search_indexes.sql for the indexes behind the productions query.
 */
export async function searchAll(rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const db = createPublicClient();
  const like = toLikePattern(query);
  const tsQuery = toTsQuery(query);
  const needle = normalize(query);

  // A production matches on its name, its prose, or a fuzzy name hit. `or` is one request.
  const productionFilter = [
    `name.ilike.${quoted(like)}`,
    `subcategory.ilike.${quoted(like)}`,
    ...(tsQuery ? [`name.fts(english).${tsQuery}`, `description.fts(english).${tsQuery}`] : []),
  ].join(",");

  const [productions, corpus] = await Promise.all([
    db
      .from("productions")
      .select("name, slug, category")
      .or(productionFilter)
      .order("name")
      .limit(PER_GROUP),
    getLookupCorpus(),
  ]);

  if (productions.error) throw new Error(`search failed: ${productions.error.message}`);

  return [
    ...(productions.data ?? []).map((r) => ({
      group: "production" as const,
      name: r.name,
      slug: r.slug,
      detail: categoryLabel(r.category),
      href: `/p/${r.slug}`,
    })),
    ...corpus.venues
      .filter((v) => contains(v.name, needle))
      .slice(0, PER_GROUP)
      .map((v) => ({
        group: "venue" as const,
        name: v.name,
        slug: v.slug,
        // Venues have no page of their own in Phase 1 — their city does.
        detail: v.city ? [v.city.name, v.city.state].filter(Boolean).join(", ") : null,
        href: v.city ? `/city/${v.city.slug}` : "/browse",
      })),
    ...corpus.cities
      .filter((c) => contains(c.name, needle))
      .slice(0, PER_GROUP)
      .map((c) => ({
        group: "city" as const,
        name: c.name,
        slug: c.slug,
        detail: c.state,
        href: `/city/${c.slug}`,
      })),
    ...corpus.networks
      .filter((n) => contains(n.name, needle))
      .slice(0, PER_GROUP)
      .map((n) => ({
        group: "network" as const,
        name: n.name,
        slug: n.slug,
        detail: n.isStreaming ? "streaming" : "broadcast",
        href: `/network/${n.slug}`,
      })),
    ...corpus.companies
      .filter((c) => contains(c.name, needle))
      .slice(0, PER_GROUP)
      .map((c) => ({
        group: "company" as const,
        name: c.name,
        slug: c.slug,
        detail: c.headquarters,
        href: `/company/${c.slug}`,
      })),
  ];
}
