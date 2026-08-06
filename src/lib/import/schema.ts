import { z } from "zod";

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
] as const;

export const STATUSES = ["confirmed", "rumored", "announced", "completed", "cancelled"] as const;

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
    load_in: dateString,
    tech_rehearsal: dateString,
    dress_rehearsal: dateString,
    show_date: dateString,
    strike: dateString,
  })
  .strict();

export const ViewershipInput = z
  .object({
    year: z.number().int().min(1900).max(2200),
    average_viewers: z.number().nonnegative().nullish(),
    peak_viewers: z.number().nonnegative().nullish(),
  })
  .strict();

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

export const ImportPayload = z
  .array(ProductionInput)
  .min(1, "Paste a non-empty JSON array of productions.");

export type CityInputT = z.infer<typeof CityInput>;
export type VenueInputT = z.infer<typeof VenueInput>;
export type NetworkInputT = z.infer<typeof NetworkInput>;
export type CompanyInputT = z.infer<typeof CompanyInput>;
export type EditionInputT = z.infer<typeof EditionInput>;
export type ViewershipInputT = z.infer<typeof ViewershipInput>;
export type ProductionInputT = z.infer<typeof ProductionInput>;
