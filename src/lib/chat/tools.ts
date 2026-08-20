import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { todayISO } from "@/lib/format";
import { getCity, getVenuesInCity, productionsInCity } from "@/lib/queries/entities";
import {
  allEntries,
  getProduction,
  getProductions,
  pickEdition,
  teamForEdition,
  upcomingEntries,
} from "@/lib/queries/productions";
import { searchAll } from "@/lib/queries/search";
import type { Production } from "@/lib/queries/types";

/**
 * The assistant's read-only window onto the grid.
 *
 * Every executor here goes through the existing query layer, which runs on the ANON Supabase
 * client and is therefore bound by the same RLS as a visitor's browser. The chat route never
 * imports createAdminClient, so the assistant cannot write and cannot see a row the public
 * cannot see — a prompt injection in a production description buys nothing.
 *
 * "Structured queries, not RAG" is the shape LIVEGRID_PLAN.md specifies for this feature: the
 * model asks a question in the schema's own vocabulary and gets rows back, rather than
 * retrieving prose about rows.
 */

/** Trimmed to what an answer actually needs. The full nested Production is mostly noise here. */
function summarise(production: Production) {
  const { edition, daysOut, isUpcoming } = pickEdition(production);
  return {
    name: production.name,
    slug: production.slug,
    href: `/p/${production.slug}`,
    category: production.category,
    subcategory: production.subcategory,
    scale: production.scale,
    network: (edition?.network ?? production.network)?.name ?? null,
    company: production.company?.name ?? null,
    typicalMonth: production.typicalMonth,
    confidence: production.confidence,
    edition: edition
      ? {
          year: edition.year,
          status: edition.status,
          startDate: edition.startDate,
          endDate: edition.endDate,
          city: edition.city?.name ?? null,
          venue: edition.venue?.name ?? null,
          daysOut,
          isUpcoming,
        }
      : null,
  };
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_grid",
    description:
      "Free-text search across productions, cities, venues, networks and companies. Use this " +
      "first when the user names something and you need its slug. Returns at most six hits " +
      "per group.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, at least two characters." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_production",
    description:
      "Everything on record for one production: every edition with dates, venue, city and " +
      "broadcaster, the production team, viewership history, and the sources behind it. Use " +
      "the slug from search_grid or list_productions.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Production slug, e.g. 'super-bowl'." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "list_productions",
    description:
      "Filter the whole grid. All filters are optional and combine with AND. Use this for " +
      "questions like 'what game shows tape in Atlanta' or 'what is on in March'.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "One of the fixed category values." },
        city: { type: "string", description: "City name or slug, matched loosely." },
        network: { type: "string", description: "Network name, matched loosely." },
        month: { type: "integer", description: "1-12. Uses the edition month, else typical month." },
        status: { type: "string", description: "confirmed | announced | rumored | completed | cancelled" },
        minScale: { type: "integer", description: "1-5. Production scale floor." },
        sourcedOnly: { type: "boolean", description: "Exclude records with no citations." },
        limit: { type: "integer", description: "Default 25, max 60." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upcoming",
    description:
      "Productions with a scheduled future edition, soonest first. Optionally bounded by date " +
      "and filtered by city or category. This is the 'what is coming up' question.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ISO date. Defaults to today." },
        to: { type: "string", description: "ISO date. Optional upper bound." },
        city: { type: "string", description: "City name or slug." },
        category: { type: "string" },
        limit: { type: "integer", description: "Default 20, max 60." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "city_snapshot",
    description:
      "One city: its venues on record and the productions that shoot there. Use for 'what is " +
      "filming in Atlanta' style questions.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "City slug, e.g. 'atlanta'." },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "grid_coverage",
    description:
      "What the grid does and does not hold: totals, counts per category, and how much is " +
      "sourced. Use when the user asks how complete the data is, or before claiming a " +
      "category is empty.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Loose name match: slug-ish comparison so "New York" finds "new-york". */
function loosely(value: string | null | undefined, needle: string): boolean {
  if (!value) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return norm(value).includes(norm(needle));
}

function clamp(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(max, Math.trunc(n)));
}

type Args = Record<string, unknown>;

/**
 * Runs one tool call. Returns a plain object; the caller JSON-stringifies it into the
 * tool_result block.
 *
 * Errors are returned as `{ error }` rather than thrown, so a bad slug becomes something the
 * model can recover from on the next turn instead of a dead conversation.
 */
export async function runTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "search_grid": {
      const query = String(args.query ?? "").trim();
      if (query.length < 2) return { error: "query must be at least two characters" };
      return { hits: await searchAll(query) };
    }

    case "get_production": {
      const slug = String(args.slug ?? "").trim();
      const production = await getProduction(slug);
      if (!production) {
        return { error: `no production with slug "${slug}" — try search_grid first` };
      }
      const { edition } = pickEdition(production);
      return {
        name: production.name,
        slug: production.slug,
        href: `/p/${production.slug}`,
        category: production.category,
        subcategory: production.subcategory,
        scale: production.scale,
        typicalMonth: production.typicalMonth,
        recurring: production.recurring,
        description: production.description,
        network: production.network?.name ?? null,
        company: production.company?.name ?? null,
        confidence: production.verification.confidence,
        verifiedOn: production.verification.verifiedOn,
        sources: production.verification.sources.map((s) => ({
          publisher: s.publisher,
          tier: s.tier,
          url: s.url,
        })),
        editions: production.editions.map((e) => ({
          year: e.year,
          status: e.status,
          startDate: e.startDate,
          endDate: e.endDate,
          city: e.city?.name ?? null,
          venue: e.venue?.name ?? null,
          network: e.network?.name ?? null,
          confidence: production.editionVerification[e.id]?.confidence ?? "unverified",
          timeline: e.timeline,
        })),
        // The team that applies to the edition in play, plus the entries that apply to every
        // year. Returning the whole team unfiltered would make a long-running show unreadable.
        team: teamForEdition(production.team, edition?.id ?? null).map((m) => ({
          role: m.role,
          name: m.company?.name ?? m.personName,
          note: m.note,
        })),
        viewership: production.viewership,
      };
    }

    case "list_productions": {
      const limit = clamp(args.limit, 25, 60);
      const entries = allEntries(await getProductions());

      const filtered = entries.filter(({ production, edition }) => {
        if (args.category && production.category !== args.category) return false;
        if (args.status && edition?.status !== args.status) return false;
        if (args.minScale && (production.scale ?? 0) < Number(args.minScale)) return false;
        if (args.sourcedOnly && production.confidence === "unverified") return false;
        if (args.city && !loosely(edition?.city?.name, String(args.city))) return false;
        if (args.network) {
          const network = edition?.network ?? production.network;
          if (!loosely(network?.name, String(args.network))) return false;
        }
        if (args.month) {
          const month = edition?.startDate
            ? Number(edition.startDate.slice(5, 7))
            : production.typicalMonth;
          if (month !== Number(args.month)) return false;
        }
        return true;
      });

      return {
        total: filtered.length,
        returned: Math.min(filtered.length, limit),
        productions: filtered.slice(0, limit).map(({ production }) => summarise(production)),
      };
    }

    case "upcoming": {
      const limit = clamp(args.limit, 20, 60);
      const from = typeof args.from === "string" ? args.from : todayISO();
      const to = typeof args.to === "string" ? args.to : null;

      const entries = upcomingEntries(await getProductions(), from).filter(
        ({ production, edition }) => {
          if (!edition?.startDate) return false;
          if (to && edition.startDate > to) return false;
          if (args.category && production.category !== args.category) return false;
          if (args.city && !loosely(edition.city?.name, String(args.city))) return false;
          return true;
        },
      );

      return {
        from,
        to,
        total: entries.length,
        returned: Math.min(entries.length, limit),
        productions: entries.slice(0, limit).map(({ production }) => summarise(production)),
      };
    }

    case "city_snapshot": {
      const slug = String(args.slug ?? "").trim();
      const city = await getCity(slug);
      if (!city) return { error: `no city with slug "${slug}" — try search_grid first` };

      const [venues, productions] = await Promise.all([
        getVenuesInCity(slug),
        productionsInCity(slug),
      ]);

      return {
        city: { name: city.name, slug: city.slug, state: city.state, href: `/city/${city.slug}` },
        venues: venues.map((v) => ({ name: v.name, capacity: v.capacity })),
        productions: productions.map(summarise),
      };
    }

    case "grid_coverage": {
      const productions = await getProductions();
      const byCategory = new Map<string, number>();
      const byConfidence = new Map<string, number>();
      for (const p of productions) {
        byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
        byConfidence.set(p.confidence, (byConfidence.get(p.confidence) ?? 0) + 1);
      }
      return {
        productions: productions.length,
        editions: productions.reduce((n, p) => n + p.editions.length, 0),
        byCategory: Object.fromEntries(byCategory),
        byConfidence: Object.fromEntries(byConfidence),
        note:
          "Seeding is in progress. A category with a low count is under-seeded, not evidence " +
          "that few such productions exist.",
      };
    }

    default:
      return { error: `unknown tool "${name}"` };
  }
}
