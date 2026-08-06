import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/slug";
import type {
  CityInputT,
  CompanyInputT,
  EditionInputT,
  NetworkInputT,
  ProductionInputT,
  VenueInputT,
} from "./schema";

type Db = SupabaseClient<Database>;

export type Counts = { created: number; updated: number };

export type ImportReport = {
  ok: boolean;
  received: number;
  summary: {
    productions: Counts;
    editions: Counts;
    viewership: Counts;
  };
  /**
   * Lookup rows this run brought into existence, as "Name (slug)".
   * Read this every time: it is how "CBS" vs "CBS Sports" gets caught during spot-check
   * instead of silently forking into two rows.
   */
  createdLookups: {
    cities: string[];
    networks: string[];
    companies: string[];
    venues: string[];
  };
  errors: { index: number; name: string | null; message: string }[];
};

function emptyReport(received: number): ImportReport {
  return {
    ok: true,
    received,
    summary: {
      productions: { created: 0, updated: 0 },
      editions: { created: 0, updated: 0 },
      viewership: { created: 0, updated: 0 },
    },
    createdLookups: { cities: [], networks: [], companies: [], venues: [] },
    errors: [],
  };
}

/**
 * Drops `undefined` keys but keeps explicit `null`s.
 *
 * The distinction carries real meaning here: a key that is absent from the pasted JSON
 * means "leave whatever is already in the database alone", while an explicit `null` means
 * "clear this field". Without this, re-importing a short record would wipe columns that an
 * earlier, richer import had filled in.
 */
function definedOnly<T extends object>(obj: T): T {
  // The cast is safe by construction: every key dropped here held `undefined`, and the
  // caller's type already admits `undefined` for that key.
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

// ---------------------------------------------------------------------------
// Lookup resolution — find by slug, else create. Provided non-undefined fields
// always win over what is already stored.
// ---------------------------------------------------------------------------

async function resolveCity(db: Db, input: CityInputT, report: ImportReport): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const ctx = `city "${input.name}"`;

  const { data: existing, error } = await db
    .from("cities")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({
    name: input.name,
    state: input.state,
    country: input.country ?? undefined, // NOT NULL with a default — never write null
    timezone: input.timezone,
    lat: input.lat,
    lng: input.lng,
  });

  if (existing) {
    const { error: updateError } = await db.from("cities").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("cities")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.cities.push(`${input.name} (${slug})`);
  return inserted.id;
}

async function resolveNetwork(db: Db, input: NetworkInputT, report: ImportReport): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const ctx = `network "${input.name}"`;

  const { data: existing, error } = await db
    .from("networks")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({
    name: input.name,
    logo_url: input.logo_url,
    is_streaming: input.is_streaming, // NOT NULL with a default
    website: input.website,
  });

  if (existing) {
    const { error: updateError } = await db.from("networks").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("networks")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.networks.push(`${input.name} (${slug})`);
  return inserted.id;
}

async function resolveCompany(db: Db, input: CompanyInputT, report: ImportReport): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const ctx = `company "${input.name}"`;

  const { data: existing, error } = await db
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({
    name: input.name,
    logo_url: input.logo_url,
    headquarters: input.headquarters,
    website: input.website,
  });

  if (existing) {
    const { error: updateError } = await db.from("companies").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("companies")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.companies.push(`${input.name} (${slug})`);
  return inserted.id;
}

async function resolveVenue(
  db: Db,
  input: VenueInputT,
  report: ImportReport,
): Promise<{ venueId: string; cityId: string | null }> {
  const slug = input.slug ?? slugify(input.name);
  const ctx = `venue "${input.name}"`;

  const cityId = input.city ? await resolveCity(db, input.city, report) : null;

  const { data: existing, error } = await db
    .from("venues")
    .select("id, city_id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({
    name: input.name,
    address: input.address,
    capacity: input.capacity,
    website: input.website,
    city_id: cityId ?? undefined,
  });

  if (existing) {
    const { error: updateError } = await db.from("venues").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    return { venueId: existing.id, cityId: cityId ?? existing.city_id };
  }

  const { data: inserted, error: insertError } = await db
    .from("venues")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.venues.push(`${input.name} (${slug})`);
  return { venueId: inserted.id, cityId };
}

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

/**
 * Collapses the two accepted shapes into one list: either the nested `editions` array,
 * or the flat single-edition shorthand written directly on the production.
 * `schema.ts` has already guaranteed these are mutually exclusive.
 */
function normalizeEditions(input: ProductionInputT): EditionInputT[] {
  if (input.editions?.length) return input.editions;
  if (input.year === undefined) return [];

  return [
    {
      year: input.year,
      status: input.status,
      city: input.city,
      venue: input.venue,
      start_date: input.start_date,
      end_date: input.end_date,
    },
  ];
}

async function upsertEdition(
  db: Db,
  productionId: string,
  input: EditionInputT,
  report: ImportReport,
): Promise<void> {
  const ctx = `edition ${input.year}`;

  const venue = input.venue ? await resolveVenue(db, input.venue, report) : null;
  // A venue implies a city, so an edition that names only a venue still gets a city_id.
  const explicitCityId = input.city ? await resolveCity(db, input.city, report) : null;
  const cityId = explicitCityId ?? venue?.cityId ?? null;

  const patch = definedOnly({
    start_date: input.start_date,
    end_date: input.end_date,
    status: input.status, // NOT NULL with a default of 'rumored'
    venue_id: venue?.venueId ?? undefined,
    city_id: cityId ?? undefined,
    load_in: input.load_in,
    tech_rehearsal: input.tech_rehearsal,
    dress_rehearsal: input.dress_rehearsal,
    show_date: input.show_date,
    strike: input.strike,
  });

  const { data: existing, error } = await db
    .from("editions")
    .select("id")
    .eq("production_id", productionId)
    .eq("year", input.year)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  if (existing) {
    const { error: updateError } = await db.from("editions").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    report.summary.editions.updated += 1;
    return;
  }

  const { error: insertError } = await db
    .from("editions")
    .insert({ ...patch, production_id: productionId, year: input.year });
  if (insertError) fail(ctx, insertError.message);
  report.summary.editions.created += 1;
}

async function upsertViewership(
  db: Db,
  productionId: string,
  input: { year: number; average_viewers?: number | null; peak_viewers?: number | null },
  report: ImportReport,
): Promise<void> {
  const ctx = `viewership ${input.year}`;

  const patch = definedOnly({
    average_viewers: input.average_viewers,
    peak_viewers: input.peak_viewers,
  });

  const { data: existing, error } = await db
    .from("viewership")
    .select("id")
    .eq("production_id", productionId)
    .eq("year", input.year)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  if (existing) {
    const { error: updateError } = await db.from("viewership").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    report.summary.viewership.updated += 1;
    return;
  }

  const { error: insertError } = await db
    .from("viewership")
    .insert({ ...patch, production_id: productionId, year: input.year });
  if (insertError) fail(ctx, insertError.message);
  report.summary.viewership.created += 1;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

async function importRecord(db: Db, input: ProductionInputT, report: ImportReport): Promise<void> {
  const slug = input.slug ?? slugify(input.name);
  const ctx = `production "${input.name}"`;

  const networkId = input.network ? await resolveNetwork(db, input.network, report) : null;
  const companyId = input.production_company
    ? await resolveCompany(db, input.production_company, report)
    : null;

  const patch = definedOnly({
    name: input.name,
    category: input.category,
    subcategory: input.subcategory,
    network_id: networkId ?? undefined,
    production_company_id: companyId ?? undefined,
    typical_month: input.typical_month,
    recurring: input.recurring, // NOT NULL with a default
    production_scale: input.production_scale,
    description: input.description,
    logo_url: input.logo_url,
    hero_image_url: input.hero_image_url,
  });

  const { data: existing, error } = await db
    .from("productions")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  let productionId: string;
  if (existing) {
    const { error: updateError } = await db.from("productions").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    productionId = existing.id;
    report.summary.productions.updated += 1;
  } else {
    const { data: inserted, error: insertError } = await db
      .from("productions")
      // `slug` is written on create only — renames must never regenerate it.
      .insert({ ...patch, name: input.name, slug, category: input.category })
      .select("id")
      .single();
    if (insertError) fail(ctx, insertError.message);
    productionId = inserted.id;
    report.summary.productions.created += 1;
  }

  for (const edition of normalizeEditions(input)) {
    await upsertEdition(db, productionId, edition, report);
  }
  for (const row of input.viewership ?? []) {
    await upsertViewership(db, productionId, row, report);
  }
}

/**
 * Imports a validated batch.
 *
 * Records are processed one at a time and failures are isolated: a bad record is reported
 * and the rest still import. Note that Supabase's REST client has no multi-statement
 * transaction, so a record that fails midway can leave its lookup rows behind. That is
 * safe here because every write is keyed on a stable slug or (production_id, year) — fix
 * the record and paste the batch again, and the result converges.
 */
export async function runImport(db: Db, records: ProductionInputT[]): Promise<ImportReport> {
  const report = emptyReport(records.length);

  for (const [index, record] of records.entries()) {
    try {
      await importRecord(db, record, report);
    } catch (cause) {
      report.ok = false;
      report.errors.push({
        index,
        name: record?.name ?? null,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return report;
}
