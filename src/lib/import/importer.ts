import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/slug";
import { ProductionInput } from "./schema";
import type {
  CityInputT,
  CompanyInputT,
  EditionInputT,
  NetworkInputT,
  ProductionInputT,
  SourceInputT,
  TeamInputT,
  VenueInputT,
  ViewershipInputT,
} from "./schema";

type Db = SupabaseClient<Database>;

export type Counts = { created: number; updated: number };

/**
 * Confidence tiers, in ascending order. Mirrored from CONFIDENCE_LEVELS; the order matters
 * here because it is what `deriveConfidence` compares against.
 */
type Confidence = "unverified" | "single_source" | "corroborated" | "official";

export type ImportReport = {
  ok: boolean;
  received: number;
  summary: {
    productions: Counts;
    editions: Counts;
    viewership: Counts;
    team: Counts;
    sources: Counts;
    citations: Counts;
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
  /**
   * Confidence as recomputed from citations at the end of the run, tallied.
   * `unverified` here is not an error — it is a record whose sources have not been
   * researched yet, and reading this row is how a half-sourced batch gets noticed.
   */
  confidence: Record<Confidence, number>;
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
      team: { created: 0, updated: 0 },
      sources: { created: 0, updated: 0 },
      citations: { created: 0, updated: 0 },
    },
    createdLookups: { cities: [], networks: [], companies: [], venues: [] },
    confidence: { unverified: 0, single_source: 0, corroborated: 0, official: 0 },
    errors: [],
  };
}

/**
 * Per-run memo of resolved lookup ids, keyed by slug.
 *
 * Every resolver below is find-by-slug-else-create, which costs a round trip even when the
 * answer has not changed since the last record. Measured at ~150ms per Supabase call, and a
 * 35-record sports batch resolves "NBC" and "Los Angeles" dozens of times — that repetition
 * alone was most of a batch's runtime and the reason batch size had to stay small.
 *
 * Correct because the run is the only writer: nothing else can change a lookup row mid-batch,
 * and the resolvers write field updates on the FIRST encounter, which is when a record's
 * richer lookup object (an address, a capacity) actually arrives.
 */
type LookupCache = {
  cities: Map<string, string>;
  networks: Map<string, string>;
  companies: Map<string, string>;
  /** Venues carry a city too, so the memo has to hold both halves of the return. */
  venues: Map<string, { venueId: string; cityId: string | null }>;
  sources: Map<string, string>;
};

function emptyCache(): LookupCache {
  return {
    cities: new Map(),
    networks: new Map(),
    companies: new Map(),
    venues: new Map(),
    sources: new Map(),
  };
}

/** Everything the per-record helpers need that is not the record itself. */
type Run = { db: Db; report: ImportReport; cache: LookupCache };

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

async function resolveCity(run: Run, input: CityInputT): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const cached = run.cache.cities.get(slug);
  if (cached) return cached;

  const { db, report } = run;
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
    run.cache.cities.set(slug, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("cities")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.cities.push(`${input.name} (${slug})`);
  run.cache.cities.set(slug, inserted.id);
  return inserted.id;
}

async function resolveNetwork(run: Run, input: NetworkInputT): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const cached = run.cache.networks.get(slug);
  if (cached) return cached;

  const { db, report } = run;
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
    run.cache.networks.set(slug, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("networks")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.networks.push(`${input.name} (${slug})`);
  run.cache.networks.set(slug, inserted.id);
  return inserted.id;
}

async function resolveCompany(run: Run, input: CompanyInputT): Promise<string> {
  const slug = input.slug ?? slugify(input.name);
  const cached = run.cache.companies.get(slug);
  if (cached) return cached;

  const { db, report } = run;
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
    run.cache.companies.set(slug, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("companies")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.companies.push(`${input.name} (${slug})`);
  run.cache.companies.set(slug, inserted.id);
  return inserted.id;
}

async function resolveVenue(
  run: Run,
  input: VenueInputT,
  /**
   * City to fall back to when the venue itself doesn't name one. Seed records usually put
   * the city on the edition rather than nested inside the venue, and an edition held at
   * venue V in city C is good evidence that V sits in C. Without this the venue row keeps
   * a null city_id and drops out of the Phase 1 city pages.
   */
  fallbackCityId: string | null = null,
): Promise<{ venueId: string; cityId: string | null }> {
  const slug = input.slug ?? slugify(input.name);
  const { db, report } = run;
  const ctx = `venue "${input.name}"`;

  const cityId = input.city ? await resolveCity(run, input.city) : fallbackCityId;

  // Cached only when this call adds no city the memo does not already carry. A venue first
  // seen without a city and seen again with one must still get its city_id written, which
  // is the normal shape when an early edition names only the venue.
  const cached = run.cache.venues.get(slug);
  if (cached && (cityId === null || cached.cityId === cityId)) return cached;

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
    const resolved = { venueId: existing.id, cityId: cityId ?? existing.city_id };
    run.cache.venues.set(slug, resolved);
    return resolved;
  }

  const { data: inserted, error: insertError } = await db
    .from("venues")
    .insert({ ...patch, name: input.name, slug })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.venues.push(`${input.name} (${slug})`);
  const resolved = { venueId: inserted.id, cityId };
  run.cache.venues.set(slug, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/** The subject a citation attaches to. Exactly one, matching citations_one_subject. */
type CitationSubject =
  | { production_id: string }
  | { edition_id: string }
  | { viewership_id: string }
  | { team_id: string };

/**
 * Sources dedupe on `url`, which is the natural key and is UNIQUE in the schema. One
 * Deadline story backing eight records is one row cited eight times, so the
 * distinct-publisher count that drives confidence counts publishers rather than mentions.
 */
async function resolveSource(run: Run, input: SourceInputT): Promise<string> {
  const cached = run.cache.sources.get(input.url);
  if (cached) return cached;

  const { db, report } = run;
  const ctx = `source "${input.url}"`;

  const { data: existing, error } = await db
    .from("sources")
    .select("id")
    .eq("url", input.url)
    .maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({
    publisher: input.publisher,
    title: input.title,
    tier: input.tier,
    published_on: input.published_on,
  });

  if (existing) {
    const { error: updateError } = await db.from("sources").update(patch).eq("id", existing.id);
    if (updateError) fail(ctx, updateError.message);
    report.summary.sources.updated += 1;
    run.cache.sources.set(input.url, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("sources")
    .insert({ ...patch, url: input.url, publisher: input.publisher, tier: input.tier })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.summary.sources.created += 1;
  run.cache.sources.set(input.url, inserted.id);
  return inserted.id;
}

/**
 * Attaches sources to one subject.
 *
 * Matched against the citations_unique tuple rather than upserted, and null columns are
 * matched with `.is` not `.eq` — the same trap `upsertTeam` documents below. Three of the
 * four subject columns are null on every row here, so getting that wrong would insert a
 * duplicate on every re-paste rather than matching.
 */
async function writeCitations(
  run: Run,
  subject: CitationSubject,
  inputs: SourceInputT[] | undefined,
): Promise<void> {
  if (!inputs?.length) return;
  const { db, report } = run;

  const subjectColumns = ["production_id", "edition_id", "viewership_id", "team_id"] as const;

  for (const input of inputs) {
    const sourceId = await resolveSource(run, input);
    const field = input.field ?? null;
    const ctx = `citation "${input.url}"`;

    let query = db.from("citations").select("id").eq("source_id", sourceId);
    for (const column of subjectColumns) {
      const value = (subject as Record<string, string | undefined>)[column];
      query = value === undefined ? query.is(column, null) : query.eq(column, value);
    }
    query = field === null ? query.is("field", null) : query.eq("field", field);

    const { data: existing, error } = await query.maybeSingle();
    if (error) fail(ctx, error.message);

    if (existing) {
      // retrieved_on is the one mutable fact: re-checking a source in a later pass is
      // exactly what the triple-check protocol does, and the new date is the useful one.
      const { error: updateError } = await db
        .from("citations")
        .update({ retrieved_on: input.retrieved_on })
        .eq("id", existing.id);
      if (updateError) fail(ctx, updateError.message);
      report.summary.citations.updated += 1;
      continue;
    }

    const { error: insertError } = await db.from("citations").insert({
      ...subject,
      source_id: sourceId,
      field,
      retrieved_on: input.retrieved_on,
    });
    if (insertError) fail(ctx, insertError.message);
    report.summary.citations.created += 1;
  }
}

/**
 * The rule that makes a confidence column mean something.
 *
 *   official      >=1 official-tier source AND >=2 distinct publishers
 *   corroborated  >=2 distinct publishers, at least one not reference-tier
 *   single_source  1 source, or several that are all reference-tier
 *   unverified     no citations
 *
 * Publishers, not citations: one story cited under three different `field` values is still
 * one publisher, and counting rows instead would let a single source promote itself to
 * "corroborated" just by being thorough.
 */
function rankConfidence(rows: { tier: string; publisher: string }[]): Confidence {
  if (rows.length === 0) return "unverified";

  const publishers = new Set(rows.map((r) => r.publisher.trim().toLowerCase()));
  const hasOfficial = rows.some((r) => r.tier === "official");
  const hasNonReference = rows.some((r) => r.tier !== "reference");

  if (hasOfficial && publishers.size >= 2) return "official";
  if (publishers.size >= 2 && hasNonReference) return "corroborated";
  return "single_source";
}

/**
 * Recomputes confidence for a production and each of its editions from what is actually
 * stored, then writes it. Runs after every other write for the record.
 *
 * Derived rather than accepted from the payload on purpose. A tier a research batch can set
 * is a tier a hurried research batch will over-set, and "official" needs to mean the network
 * said so — not that someone was confident.
 */
async function deriveConfidence(
  run: Run,
  productionId: string,
  editionIds: string[],
): Promise<void> {
  const { db, report } = run;
  const ctx = "confidence";

  const apply = async (
    table: "productions" | "editions",
    id: string,
    rows: { retrieved_on: string; sources: { tier: string; publisher: string } | null }[],
  ) => {
    const cited = rows.flatMap((r) => (r.sources ? [r.sources] : []));
    const confidence = rankConfidence(cited);
    const verifiedOn =
      rows.length === 0
        ? null
        : rows.reduce((latest, r) => (r.retrieved_on > latest ? r.retrieved_on : latest), rows[0].retrieved_on);

    const { error } = await db
      .from(table)
      .update({ confidence, verified_on: verifiedOn })
      .eq("id", id);
    if (error) fail(ctx, error.message);
    report.confidence[confidence] += 1;
  };

  const { data: productionRows, error: productionError } = await db
    .from("citations")
    .select("retrieved_on, sources(tier, publisher)")
    .eq("production_id", productionId);
  if (productionError) fail(ctx, productionError.message);
  await apply("productions", productionId, productionRows ?? []);

  for (const editionId of editionIds) {
    const { data: editionRows, error: editionError } = await db
      .from("citations")
      .select("retrieved_on, sources(tier, publisher)")
      .eq("edition_id", editionId);
    if (editionError) fail(ctx, editionError.message);
    await apply("editions", editionId, editionRows ?? []);
  }
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
      // Not carried over from the production: a flat record's `network` is the
      // production's default, not an edition-level override.
    },
  ];
}

/** Returns the edition's id so `team` entries carrying a `year` can attach to it. */
async function upsertEdition(
  run: Run,
  productionId: string,
  input: EditionInputT,
): Promise<string> {
  const { db, report } = run;
  const ctx = `edition ${input.year}`;

  // Resolve the edition's own city first so it can seed the venue's city_id when the
  // venue doesn't carry one. The inference runs both ways: a venue also implies a city,
  // so an edition naming only a venue still ends up with a city_id.
  const explicitCityId = input.city ? await resolveCity(run, input.city) : null;
  const venue = input.venue ? await resolveVenue(run, input.venue, explicitCityId) : null;
  const cityId = explicitCityId ?? venue?.cityId ?? null;
  // Left null unless the edition names its own broadcaster; null inherits the production's.
  const networkId = input.network ? await resolveNetwork(run, input.network) : null;

  const patch = definedOnly({
    start_date: input.start_date,
    end_date: input.end_date,
    status: input.status, // NOT NULL with a default of 'rumored'
    venue_id: venue?.venueId ?? undefined,
    city_id: cityId ?? undefined,
    network_id: networkId ?? undefined,
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
    await writeCitations(run, { edition_id: existing.id }, input.sources);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("editions")
    .insert({ ...patch, production_id: productionId, year: input.year })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.editions.created += 1;
  await writeCitations(run, { edition_id: inserted.id }, input.sources);
  return inserted.id;
}

/**
 * Who makes the show, optionally pinned to one year.
 *
 * Keyed on the table's UNIQUE NULLS NOT DISTINCT constraint rather than a lookup-then-write,
 * because edition_id and company_id are null on a large share of rows and the default
 * NULLS DISTINCT would let every re-paste insert a duplicate instead of matching.
 */
async function upsertTeam(
  run: Run,
  productionId: string,
  input: TeamInputT,
  editionIdsByYear: Map<number, string>,
): Promise<void> {
  const { db, report } = run;
  const subject = input.company?.name ?? input.person ?? "?";
  const ctx = `team ${input.role} "${subject}"`;

  /**
   * The year may belong to an edition already in the database rather than one sent in this
   * payload — adding team data to an existing production without re-listing all of its
   * editions is the normal case, not the exception. The in-payload map is only a
   * short-circuit so a batch that does carry its editions avoids a round trip per entry.
   */
  let editionId: string | null = null;
  if (input.year !== undefined) {
    editionId = editionIdsByYear.get(input.year) ?? null;
    if (editionId === null) {
      const { data: found, error: lookupError } = await db
        .from("editions")
        .select("id")
        .eq("production_id", productionId)
        .eq("year", input.year)
        .maybeSingle();
      if (lookupError) fail(ctx, lookupError.message);
      if (!found) fail(ctx, `no edition for year ${input.year} on this production`);
      editionId = found.id;
      editionIdsByYear.set(input.year, found.id);
    }
  }

  // Companies resolve through the shared helper so vendors land in createdLookups and get
  // the same duplicate-name safety net as networks and cities.
  const companyId = input.company ? await resolveCompany(run, input.company) : null;
  const personName = input.person ?? null;

  // Matches the UNIQUE NULLS NOT DISTINCT constraint column for column. `.is` and `.eq` are
  // not interchangeable here: `.eq(col, null)` compares with `=`, which is never true for a
  // null, so a nullable key column has to be matched with `.is`.
  let query = db
    .from("production_team")
    .select("id")
    .eq("production_id", productionId)
    .eq("role", input.role);
  query = editionId === null ? query.is("edition_id", null) : query.eq("edition_id", editionId);
  query = companyId === null ? query.is("company_id", null) : query.eq("company_id", companyId);
  query = personName === null ? query.is("person_name", null) : query.eq("person_name", personName);

  const { data: existing, error } = await query.maybeSingle();
  if (error) fail(ctx, error.message);

  const patch = definedOnly({ note: input.note, sort_order: input.sort_order });

  if (existing) {
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await db
        .from("production_team")
        .update(patch)
        .eq("id", existing.id);
      if (updateError) fail(ctx, updateError.message);
    }
    report.summary.team.updated += 1;
    await writeCitations(run, { team_id: existing.id }, input.sources);
    return;
  }

  const { data: inserted, error: insertError } = await db
    .from("production_team")
    .insert({
      ...patch,
      production_id: productionId,
      edition_id: editionId,
      role: input.role,
      company_id: companyId,
      person_name: personName,
    })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.team.created += 1;
  await writeCitations(run, { team_id: inserted.id }, input.sources);
}

async function upsertViewership(
  run: Run,
  productionId: string,
  input: ViewershipInputT,
): Promise<void> {
  const { db, report } = run;
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
    await writeCitations(run, { viewership_id: existing.id }, input.sources);
    return;
  }

  const { data: inserted, error: insertError } = await db
    .from("viewership")
    .insert({ ...patch, production_id: productionId, year: input.year })
    .select("id")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.viewership.created += 1;
  await writeCitations(run, { viewership_id: inserted.id }, input.sources);
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

async function importRecord(run: Run, input: ProductionInputT): Promise<void> {
  const { db, report } = run;
  const slug = input.slug ?? slugify(input.name);
  const ctx = `production "${input.name}"`;

  const networkId = input.network ? await resolveNetwork(run, input.network) : null;
  const companyId = input.production_company
    ? await resolveCompany(run, input.production_company)
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

  await writeCitations(run, { production_id: productionId }, input.sources);

  // Editions first: team entries carrying a `year` need that year's edition id to exist.
  const editionIdsByYear = new Map<number, string>();
  for (const edition of normalizeEditions(input)) {
    editionIdsByYear.set(edition.year, await upsertEdition(run, productionId, edition));
  }
  for (const row of input.viewership ?? []) {
    await upsertViewership(run, productionId, row);
  }
  for (const member of input.team ?? []) {
    await upsertTeam(run, productionId, member, editionIdsByYear);
  }

  // Last, and over every edition the record touched — including ones already in the database
  // that this payload only added team data to, since their citation set is unchanged but
  // their tally still belongs in the report.
  await deriveConfidence(run, productionId, [...editionIdsByYear.values()]);
}

/** Best-effort name for the error report, before the record is known to be valid. */
function peekName(record: unknown): string | null {
  if (typeof record === "object" && record !== null && "name" in record) {
    const name = (record as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

/**
 * Imports a batch.
 *
 * Validation is per-record, not per-batch, and deliberately so: in a 40-record research
 * batch, one bad field should not send the other 39 back for a re-paste. A record that
 * fails validation is never written and is reported with the exact field path.
 *
 * Note that Supabase's REST client has no multi-statement transaction, so a record that
 * fails partway through writing can leave its lookup rows behind. That is safe here
 * because every write is keyed on a stable slug or (production_id, year) — fix the record,
 * paste the batch again, and the result converges.
 */
export async function runImport(db: Db, records: unknown[]): Promise<ImportReport> {
  const report = emptyReport(records.length);
  // One cache for the whole batch — see LookupCache. Scoped to the run rather than the
  // module so a long-lived serverless instance never serves a stale id after a manual edit.
  const run: Run = { db, report, cache: emptyCache() };

  for (const [index, raw] of records.entries()) {
    const parsed = ProductionInput.safeParse(raw);
    if (!parsed.success) {
      report.ok = false;
      report.errors.push({
        index,
        name: peekName(raw),
        message: parsed.error.issues
          .map((issue) => {
            const path = issue.path.join(".");
            return path ? `${path}: ${issue.message}` : issue.message;
          })
          .join("; "),
      });
      continue;
    }

    try {
      await importRecord(run, parsed.data);
    } catch (cause) {
      report.ok = false;
      report.errors.push({
        index,
        name: parsed.data.name,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return report;
}
