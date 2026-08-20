import { cache } from "react";

import { daysBetween, todayISO } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";

import type {
  CalendarEvent,
  Category,
  Confidence,
  Edition,
  EditionStatus,
  Production,
  ProductionDetail,
  ProductionEntry,
  Source,
  SourceTier,
  SummaryStats,
  TeamMember,
  TeamRole,
  Verification,
} from "./types";

/**
 * The one nested select the public pages read through.
 *
 * Must stay a single string literal — the Supabase client parses the select at the type
 * level, and a concatenation widens it to `string`, collapsing every joined column to an
 * error. (Same constraint as `getSeedStats` in src/lib/stats.ts.)
 *
 * `networks` appears twice: once on the production (the default broadcaster) and once
 * inside `editions` (the per-year override added by 20260806010000_edition_network.sql).
 * PostgREST resolves each against the table it is nested under.
 */
const PRODUCTION_SELECT =
  "id, name, slug, category, subcategory, production_scale, typical_month, recurring, description, logo_url, hero_image_url, confidence, networks(name, slug), companies(name, slug), editions(id, year, start_date, end_date, status, load_in, tech_rehearsal, dress_rehearsal, show_date, strike, cities(name, slug, state), venues(name, slug, capacity), networks(name, slug)), viewership(year, average_viewers, peak_viewers)";

/**
 * The detail page's select: everything above plus the production team.
 *
 * Spelled out in full rather than built from PRODUCTION_SELECT for the same reason that
 * constant is one literal — concatenation widens the type to `string` and collapses every
 * joined column to an error. Keeping team out of the shared select is deliberate: the
 * dashboard, browse and entity pages never paint these rows, and one production page is not
 * a reason to put them on every payload.
 */
const PRODUCTION_DETAIL_SELECT =
  "id, name, slug, category, subcategory, production_scale, typical_month, recurring, description, logo_url, hero_image_url, confidence, verified_on, networks(name, slug), companies(name, slug), editions(id, year, start_date, end_date, status, load_in, tech_rehearsal, dress_rehearsal, show_date, strike, confidence, verified_on, cities(name, slug, state), venues(name, slug, capacity), networks(name, slug), citations(field, retrieved_on, sources(url, publisher, title, tier, published_on))), viewership(year, average_viewers, peak_viewers), production_team(role, person_name, note, sort_order, edition_id, companies(name, slug)), citations(field, retrieved_on, sources(url, publisher, title, tier, published_on))";

type RawProduction = Awaited<ReturnType<typeof fetchRaw>>[number];

async function fetchRaw() {
  const db = createPublicClient();
  const { data, error } = await db.from("productions").select(PRODUCTION_SELECT).order("name");
  if (error) throw new Error(`productions query failed: ${error.message}`);
  return data ?? [];
}

function mapEdition(row: RawProduction["editions"][number]): Edition {
  return {
    id: row.id,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as EditionStatus,
    city: row.cities ? { name: row.cities.name, slug: row.cities.slug, state: row.cities.state } : null,
    venue: row.venues
      ? { name: row.venues.name, slug: row.venues.slug, capacity: row.venues.capacity }
      : null,
    network: row.networks ? { name: row.networks.name, slug: row.networks.slug } : null,
    timeline: {
      loadIn: row.load_in,
      techRehearsal: row.tech_rehearsal,
      dressRehearsal: row.dress_rehearsal,
      showDate: row.show_date,
      strike: row.strike,
    },
  };
}

function mapProduction(row: RawProduction): Production {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category as Category,
    subcategory: row.subcategory,
    scale: row.production_scale,
    typicalMonth: row.typical_month,
    recurring: row.recurring,
    description: row.description,
    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    network: row.networks ? { name: row.networks.name, slug: row.networks.slug } : null,
    company: row.companies ? { name: row.companies.name, slug: row.companies.slug } : null,
    confidence: row.confidence as Confidence,
    editions: (row.editions ?? []).map(mapEdition).sort((a, b) => a.year - b.year),
    viewership: (row.viewership ?? [])
      .map((v) => ({ year: v.year, average: v.average_viewers, peak: v.peak_viewers }))
      .sort((a, b) => a.year - b.year),
  };
}

/**
 * Every production with its editions and viewership, in one round trip.
 *
 * Fetching the whole table is deliberate at this size (34 productions / 40 editions): the
 * dashboard, browse table, facet counts and entity pages are all different views of the
 * same rows, and deriving them in memory keeps one query and one shape. Revisit when the
 * seed passes its 250-production target and the payload stops being trivial.
 *
 * `cache` dedupes this across a single render pass, so a page that needs it twice pays once.
 */
export const getProductions = cache(async (): Promise<Production[]> => {
  return (await fetchRaw()).map(mapProduction);
});

/** Rank order for display: what the reader should weigh first. */
const TIER_ORDER: Record<SourceTier, number> = { official: 0, trade: 1, reference: 2 };

/**
 * Citation rows -> the shape the page paints.
 *
 * A citation whose source failed to join is dropped rather than rendered as a blank row:
 * `on delete cascade` means that should be impossible, and inventing a placeholder for an
 * impossible state would be the only lie on a page about provenance.
 */
function mapVerification(
  confidence: string,
  verifiedOn: string | null,
  rows: {
    field: string | null;
    retrieved_on: string;
    sources: {
      url: string;
      publisher: string;
      title: string | null;
      tier: string;
      published_on: string | null;
    } | null;
  }[],
): Verification {
  const sources: Source[] = rows
    .flatMap((row) =>
      row.sources
        ? [
            {
              url: row.sources.url,
              publisher: row.sources.publisher,
              title: row.sources.title,
              tier: row.sources.tier as SourceTier,
              publishedOn: row.sources.published_on,
              retrievedOn: row.retrieved_on,
              field: row.field,
            },
          ]
        : [],
    )
    .sort(
      (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.publisher.localeCompare(b.publisher),
    );

  return { confidence: confidence as Confidence, verifiedOn, sources };
}

export const getProduction = cache(async (slug: string): Promise<ProductionDetail | null> => {
  const db = createPublicClient();
  const { data, error } = await db
    .from("productions")
    .select(PRODUCTION_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`production "${slug}" query failed: ${error.message}`);
  if (!data) return null;

  const team: TeamMember[] = (data.production_team ?? [])
    .map((row) => ({
      role: row.role as TeamRole,
      company: row.companies ? { name: row.companies.name, slug: row.companies.slug } : null,
      personName: row.person_name,
      note: row.note,
      editionId: row.edition_id,
      sortOrder: row.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const editionVerification: Record<string, Verification> = {};
  for (const e of data.editions ?? []) {
    editionVerification[e.id] = mapVerification(e.confidence, e.verified_on, e.citations ?? []);
  }

  return {
    ...mapProduction(data),
    team,
    verification: mapVerification(data.confidence, data.verified_on, data.citations ?? []),
    editionVerification,
  };
});

/** Team entries for one edition, plus the production-level ones that apply to every year. */
export function teamForEdition(team: TeamMember[], editionId: string | null): TeamMember[] {
  return team.filter((m) => m.editionId === null || m.editionId === editionId);
}

/**
 * The edition that matters right now: the next one scheduled, or failing that the most
 * recent one that happened.
 *
 * Editions with no `start_date` cannot be placed on a timeline, so they never win the
 * "next" slot — but a production made up entirely of dateless editions still resolves to
 * its latest year rather than to null, so it keeps a row in browse.
 */
export function pickEdition(production: Production, today = todayISO()): ProductionEntry {
  const dated = production.editions.filter((e) => e.startDate !== null);
  const upcoming = dated
    .filter((e) => e.startDate! >= today)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));

  if (upcoming.length > 0) {
    const edition = upcoming[0];
    return {
      production,
      edition,
      daysOut: daysBetween(today, edition.startDate!),
      isUpcoming: true,
    };
  }

  const past = dated.sort((a, b) => b.startDate!.localeCompare(a.startDate!));
  if (past.length > 0) {
    const edition = past[0];
    return {
      production,
      edition,
      daysOut: daysBetween(today, edition.startDate!),
      isUpcoming: false,
    };
  }

  const latest = production.editions.at(-1) ?? null;
  return { production, edition: latest, daysOut: null, isUpcoming: false };
}

/** Productions with a scheduled future edition, soonest first. */
export function upcomingEntries(productions: Production[], today = todayISO()): ProductionEntry[] {
  return productions
    .map((p) => pickEdition(p, today))
    .filter((entry) => entry.isUpcoming)
    .sort((a, b) => a.edition!.startDate!.localeCompare(b.edition!.startDate!));
}

/** One entry per production, upcoming first then most-recent-past. The browse table's rows. */
export function allEntries(productions: Production[], today = todayISO()): ProductionEntry[] {
  return productions.map((p) => pickEdition(p, today));
}

/**
 * Reading order for a list of productions: what is coming, soonest first, then what has
 * happened, most recent first, then whatever carries no date at all.
 *
 * Plain date sorting cannot express this — ascending buries the next show under a decade
 * of history, descending puts it behind last month's. The entity pages all want the same
 * answer to "what is happening here", so the rule lives here rather than in each of them.
 */
export function sortForDisplay(entries: ProductionEntry[]): ProductionEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;

    const aDate = a.edition?.startDate;
    const bDate = b.edition?.startDate;
    if (!aDate && !bDate) return a.production.name.localeCompare(b.production.name);
    if (!aDate) return 1;
    if (!bDate) return -1;

    return a.isUpcoming ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  });
}

/** Every dated edition flattened against its production. */
export function calendarEvents(productions: Production[]): CalendarEvent[] {
  return productions
    .flatMap((production) =>
      production.editions
        .filter((edition) => edition.startDate !== null)
        .map((edition) => ({
          editionId: edition.id,
          date: edition.startDate!,
          endDate: edition.endDate,
          year: edition.year,
          status: edition.status,
          productionName: production.name,
          productionSlug: production.slug,
          category: production.category,
          city: edition.city,
          venue: edition.venue,
          // The edition's own broadcaster wins where it is set; otherwise the production's.
          network: edition.network ?? production.network,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.productionName.localeCompare(b.productionName));
}

/** Header rail figures. Counts what is in the database, never a rounded-up marketing number. */
export function summarize(productions: Production[], today = todayISO()): SummaryStats {
  const editions = productions.flatMap((p) => p.editions);
  const cities = new Set(
    editions.map((e) => e.city?.slug).filter((slug): slug is string => Boolean(slug)),
  );
  return {
    productions: productions.length,
    editions: editions.length,
    cities: cities.size,
    upcoming: editions.filter((e) => e.startDate !== null && e.startDate >= today).length,
    rumored: editions.filter((e) => e.status === "rumored").length,
  };
}

/** Cities ranked by how many upcoming editions they hold. Empty when nothing is scheduled. */
export function busiestCities(
  productions: Production[],
  today = todayISO(),
  limit = 6,
): { city: { name: string; slug: string; state: string | null }; count: number }[] {
  const tally = new Map<string, { city: { name: string; slug: string; state: string | null }; count: number }>();

  for (const production of productions) {
    for (const edition of production.editions) {
      if (!edition.city || edition.startDate === null || edition.startDate < today) continue;
      const existing = tally.get(edition.city.slug);
      if (existing) existing.count += 1;
      else tally.set(edition.city.slug, { city: edition.city, count: 1 });
    }
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.city.name.localeCompare(b.city.name))
    .slice(0, limit);
}

/** Rumored editions, soonest first. Dateless rumors sort last but are not dropped. */
export function rumoredWatchlist(productions: Production[], limit = 8): CalendarEvent[] {
  return productions
    .flatMap((production) =>
      production.editions
        .filter((edition) => edition.status === "rumored")
        .map((edition) => ({
          editionId: edition.id,
          date: edition.startDate ?? "",
          endDate: edition.endDate,
          year: edition.year,
          status: edition.status,
          productionName: production.name,
          productionSlug: production.slug,
          category: production.category,
          city: edition.city,
          venue: edition.venue,
          network: edition.network ?? production.network,
        })),
    )
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    })
    .slice(0, limit);
}
