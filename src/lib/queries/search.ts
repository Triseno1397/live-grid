import { categoryLabel } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

import type { SearchHit } from "./types";

/** Per-group cap. The palette groups results by type, so one crowded group cannot bury another. */
const PER_GROUP = 6;

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
 * applied in `orFilter` below.
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

/**
 * Global search across productions, venues, cities, networks and companies.
 *
 * Two passes per entity, unioned and de-duplicated:
 *   - full text on productions, which is what ranks prose ("country music", "halftime")
 *   - trigram-backed `ilike` everywhere, which catches partial words and the plural people
 *     actually type ("grammys")
 *
 * Postgres does the work in both cases (AGENTS.md: Postgres FTS + pg_trgm, no Meilisearch
 * or Algolia before Phase 3). See 20260811000000_search_indexes.sql for the indexes.
 */
export async function searchAll(rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const db = createPublicClient();
  const like = toLikePattern(query);
  const tsQuery = toTsQuery(query);

  // A production matches on its name, its prose, or a fuzzy name hit. `or` is one request.
  const productionFilter = [
    `name.ilike.${quoted(like)}`,
    `subcategory.ilike.${quoted(like)}`,
    ...(tsQuery ? [`name.fts(english).${tsQuery}`, `description.fts(english).${tsQuery}`] : []),
  ].join(",");

  const [productions, venues, cities, networks, companies] = await Promise.all([
    db
      .from("productions")
      .select("name, slug, category")
      .or(productionFilter)
      .order("name")
      .limit(PER_GROUP),
    db
      .from("venues")
      .select("name, slug, cities(name, slug, state)")
      .ilike("name", like)
      .order("name")
      .limit(PER_GROUP),
    db.from("cities").select("name, slug, state").ilike("name", like).order("name").limit(PER_GROUP),
    db.from("networks").select("name, slug, is_streaming").ilike("name", like).order("name").limit(PER_GROUP),
    db.from("companies").select("name, slug, headquarters").ilike("name", like).order("name").limit(PER_GROUP),
  ]);

  const firstError = [productions, venues, cities, networks, companies].find((r) => r.error)?.error;
  if (firstError) throw new Error(`search failed: ${firstError.message}`);

  const hits: SearchHit[] = [
    ...(productions.data ?? []).map((r) => ({
      group: "production" as const,
      name: r.name,
      slug: r.slug,
      detail: categoryLabel(r.category),
      href: `/p/${r.slug}`,
    })),
    ...(venues.data ?? []).map((r) => ({
      group: "venue" as const,
      name: r.name,
      slug: r.slug,
      // Venues have no page of their own in Phase 1 — their city does.
      detail: r.cities ? [r.cities.name, r.cities.state].filter(Boolean).join(", ") : null,
      href: r.cities ? `/city/${r.cities.slug}` : "/browse",
    })),
    ...(cities.data ?? []).map((r) => ({
      group: "city" as const,
      name: r.name,
      slug: r.slug,
      detail: r.state,
      href: `/city/${r.slug}`,
    })),
    ...(networks.data ?? []).map((r) => ({
      group: "network" as const,
      name: r.name,
      slug: r.slug,
      detail: r.is_streaming ? "streaming" : "broadcast",
      href: `/network/${r.slug}`,
    })),
    ...(companies.data ?? []).map((r) => ({
      group: "company" as const,
      name: r.name,
      slug: r.slug,
      detail: r.headquarters,
      href: `/company/${r.slug}`,
    })),
  ];

  return hits;
}
