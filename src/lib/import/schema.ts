import { z } from "zod";

// Next's server bundling does not always carry zod's default English locale into the
// route-handler bundle, which silently degrades every message to a bare "Invalid input".
// Registering it explicitly keeps import errors actionable — the difference between
// "Invalid input" and "Unrecognized key: avg_viewers" is the difference between a
// five-second fix and a hunt through a 40-record batch.
z.config(z.locales.en());

/**
 * Validation for the /admin/import paste format.
 *
 * Shaped to match the seed-prompt output described in LIVEGRID_PLAN.md Phase 0, so
 * research output can be pasted with minimal reshaping. Two conveniences:
 *
 *  1. Lookups (network / production_company / city / venue) accept either a bare string
 *     ("CBS") or a full object ({ name: "CBS", is_streaming: false }).
 *  2. A single upcoming edition may be written flat on the production (year, status,
 *     city, venue, start_date, ...) instead of nested under `editions`.
 *
 * Objects are STRICT: an unrecognized key fails that record rather than being silently
 * dropped. This is deliberate — a typo like `avg_viewers` should be a loud error, not
 * quietly missing viewership data.
 */

/**
 * Must stay in sync with the productions_category_check constraint — see
 * 20260811010000_variety_category.sql, which added `variety`. A value here that the
 * database rejects surfaces as a failed import, not a validation error, which is a much
 * worse place to find out.
 */
export const CATEGORIES = [
  "awards",
  "sports",
  "concerts",
  "game_shows",
  "reality",
  "streaming",
  "holiday",
  "tech",
  "gaming",
  "corporate",
  "political",
  "international",
  // Live-to-tape talk and sketch: the Television Academy's own grouping, so late night
  // and SNL sit together without either being forced somewhere it does not belong.
  "variety",
] as const;

export const STATUSES = ["confirmed", "rumored", "announced", "completed", "cancelled"] as const;

/**
 * Who makes the show. Must stay in sync with the production_team role check constraint —
 * see 20260812000000_production_team.sql.
 *
 * Deliberately short. This answers "who's running it?", not "roll the end credits": the
 * three team roles a freelancer asks about, plus the four supplier disciplines a rental
 * house does. Adding a role means a migration, which is the point — the vocabulary stays
 * queryable instead of drifting into free text.
 */
export const TEAM_ROLES = [
  "production_company",
  "executive_producer",
  "director",
  "lighting",
  "audio",
  "video",
  "staging",
] as const;

/**
 * How much weight a source carries. Must stay in sync with the sources tier check
 * constraint — see 20260819000000_provenance.sql.
 *
 * The split is by who is in a position to know, not by prestige. A venue's own booking
 * calendar is `official` for "is the show at this venue"; Variety reporting the same thing
 * is `trade`. `reference` covers Wikipedia, aggregators and fan wikis — useful for finding
 * a fact, never sufficient for confirming one.
 */
export const SOURCE_TIERS = ["official", "trade", "reference"] as const;

/**
 * Derived from citations by the importer, never written from a payload — see
 * `deriveConfidence` in importer.ts and the rules in the provenance migration. It is listed
 * here because the UI and stats need the vocabulary, not because a seed record may set it.
 */
export const CONFIDENCE_LEVELS = [
  "unverified",
  "single_source",
  "corroborated",
  "official",
] as const;

/** Empty strings from a pasted spreadsheet mean "unknown", not "". */
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const dateString = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date in YYYY-MM-DD form")
    .nullish(),
);

const optionalText = z.preprocess(blankToNull, z.string().nullish());
const optionalUrl = z.preprocess(blankToNull, z.string().url("expected a full URL").nullish());

/** Accept "Atlanta" as shorthand for { name: "Atlanta" }. */
const asObject = (v: unknown) => (typeof v === "string" ? { name: v } : v);

/**
 * Where a fact came from. Attachable to a production, an edition, a viewership row or a team
 * credit — whichever the source actually backs.
 *
 * `retrieved_on` is required and `published_on` is not, deliberately: a network press page
 * carries no publication date but the date we read it is always knowable, and "is this
 * stale?" is answered by when it was last checked.
 */
export const SourceInput = z
  .object({
    url: z.string().url("expected a full URL"),
    /** The organisation that published it. Drives the distinct-publisher count. */
    publisher: z.string().min(1),
    tier: z.enum(SOURCE_TIERS),
    title: optionalText,
    published_on: dateString,
    retrieved_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date in YYYY-MM-DD form"),
    /**
     * Which fact this backs — 'show_date', 'venue', 'network', 'viewership'. Omitted means
     * the record generally, the right shape for a profile piece about the show itself.
     */
    field: optionalText,
  })
  .strict();

export const CityInput = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    state: optionalText,
    country: optionalText,
    timezone: optionalText,
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
  })
  .strict();

export const VenueInput = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    address: optionalText,
    capacity: z.number().int().positive().nullish(),
    website: optionalUrl,
    city: z.preprocess(asObject, CityInput.nullish()),
  })
  .strict();

export const NetworkInput = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    logo_url: optionalUrl,
    is_streaming: z.boolean().optional(),
    website: optionalUrl,
  })
  .strict();

export const CompanyInput = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    logo_url: optionalUrl,
    headquarters: optionalText,
    website: optionalUrl,
  })
  .strict();

export const EditionInput = z
  .object({
    year: z.number().int().min(1900).max(2200),
    start_date: dateString,
    end_date: dateString,
    status: z.enum(STATUSES).optional(),
    city: z.preprocess(asObject, CityInput.nullish()),
    venue: z.preprocess(asObject, VenueInput.nullish()),
    // Set only when this edition's broadcaster differs from the production's default
    // (Emmys rotate networks; the Grammys move to ABC in 2027).
    network: z.preprocess(asObject, NetworkInput.nullish()),
    load_in: dateString,
    tech_rehearsal: dateString,
    dress_rehearsal: dateString,
    show_date: dateString,
    strike: dateString,
    /** Backs this year's facts specifically — the date, the venue, the broadcaster. */
    sources: z.array(SourceInput).optional(),
  })
  .strict();

export const ViewershipInput = z
  .object({
    year: z.number().int().min(1900).max(2200),
    average_viewers: z.number().nonnegative().nullish(),
    peak_viewers: z.number().nonnegative().nullish(),
    sources: z.array(SourceInput).optional(),
  })
  .strict();

export const TeamInput = z
  .object({
    role: z.enum(TEAM_ROLES),
    /** Suppliers and production companies. Accepts "Fulwell 73" or the full object. */
    company: z.preprocess(asObject, CompanyInput.nullish()),
    /** Free text — there are no person pages, so a name is the whole record. */
    person: optionalText,
    /**
     * Attaches the row to that year's edition. Omitted means the credit applies to the
     * production generally rather than to one year, which is the right shape for a
     * long-running show whose producer has not changed.
     */
    year: z.number().int().min(1900).max(2200).optional(),
    note: optionalText,
    sort_order: z.number().int().optional(),
    /** Backs this credit. A trade story naming the EP is the usual case. */
    sources: z.array(SourceInput).optional(),
  })
  .strict()
  .refine((v) => v.company != null || (v.person != null && v.person !== ""), {
    message: "a team entry needs a `company`, a `person`, or both",
  });

/**
 * Common aliases from research output are normalized before validation.
 * Kept deliberately short — this is a convenience, not a licence to invent field names.
 */
const ALIASES: Record<string, string> = {
  company: "production_company",
  production_co: "production_company",
  scale: "production_scale",
  month: "typical_month",
  viewership_history: "viewership",
};

const applyAliases = (v: unknown) => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return v;
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    const target = ALIASES[key] ?? key;
    // An explicit canonical key always wins over an alias.
    if (target in out && key !== target) continue;
    out[target] = value;
  }
  return out;
};

export const ProductionInput = z.preprocess(
  applyAliases,
  z
    .object({
      name: z.string().min(1),
      slug: z.string().min(1).optional(),
      category: z.enum(CATEGORIES),
      subcategory: optionalText,
      network: z.preprocess(asObject, NetworkInput.nullish()),
      production_company: z.preprocess(asObject, CompanyInput.nullish()),
      typical_month: z.number().int().min(1).max(12).nullish(),
      recurring: z.boolean().optional(),
      production_scale: z.number().int().min(1).max(5).nullish(),
      description: optionalText,
      logo_url: optionalUrl,
      hero_image_url: optionalUrl,

      editions: z.array(EditionInput).optional(),
      viewership: z.array(ViewershipInput).optional(),
      team: z.array(TeamInput).optional(),

      /**
       * Backs the production itself — what it is, who makes it, roughly when it runs.
       * Per-year facts belong on the edition's own `sources`, not here.
       *
       * There is deliberately no `confidence` key. It is derived from these citations after
       * the write, and the strict object below will reject a batch that tries to assert it —
       * which is the point: a tier you can set is a tier you will over-set.
       */
      sources: z.array(SourceInput).optional(),

      // --- flat single-edition shorthand (see file header) ---
      year: z.number().int().min(1900).max(2200).optional(),
      status: z.enum(STATUSES).optional(),
      city: z.preprocess(asObject, CityInput.nullish()),
      venue: z.preprocess(asObject, VenueInput.nullish()),
      start_date: dateString,
      end_date: dateString,
    })
    .strict()
    .superRefine((val, ctx) => {
      const hasFlat =
        val.year !== undefined ||
        val.status !== undefined ||
        val.city != null ||
        val.venue != null ||
        val.start_date != null ||
        val.end_date != null;

      if (hasFlat && val.editions?.length) {
        ctx.addIssue({
          code: "custom",
          message:
            "Use either the nested `editions` array or the flat edition fields " +
            "(year/status/city/venue/start_date/end_date), not both.",
        });
      }
      // A flat edition needs a year to key on — (production_id, year) is the upsert key.
      if (hasFlat && val.year === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["year"],
          message: "`year` is required when using the flat edition shorthand.",
        });
      }
    }),
);

/**
 * Only the envelope. Records stay `unknown` here and are validated one at a time in
 * runImport, so a single bad entry is reported against its own index instead of
 * rejecting the whole batch.
 */
export const ImportEnvelope = z
  .array(z.unknown())
  .min(1, "Paste a non-empty JSON array of productions.");

export type CityInputT = z.infer<typeof CityInput>;
export type VenueInputT = z.infer<typeof VenueInput>;
export type NetworkInputT = z.infer<typeof NetworkInput>;
export type CompanyInputT = z.infer<typeof CompanyInput>;
export type EditionInputT = z.infer<typeof EditionInput>;
export type ViewershipInputT = z.infer<typeof ViewershipInput>;
export type TeamInputT = z.infer<typeof TeamInput>;
export type SourceInputT = z.infer<typeof SourceInput>;
export type ProductionInputT = z.infer<typeof ProductionInput>;
