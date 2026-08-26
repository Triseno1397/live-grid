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
type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

/**
 * `unchanged` separates "written again with the same values" from "already correct".
 *
 * It exists for `--verify`: a clean re-import used to report dozens of updates, because
 * every resolver wrote its patch unconditionally, and "N updated" is indistinguishable from
 * "N silently rewritten with the wrong thing". With the prefetch carrying stored rows, a
 * no-op patch is skipped and a second run reports almost entirely `unchanged` — which is a
 * real idempotency signal rather than an absence of one.
 */
export type Counts = { created: number; updated: number; unchanged: number };

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

function emptyCounts(): Counts {
  return { created: 0, updated: 0, unchanged: 0 };
}

function emptyReport(received: number): ImportReport {
  return {
    ok: true,
    received,
    summary: {
      productions: emptyCounts(),
      editions: emptyCounts(),
      viewership: emptyCounts(),
      team: emptyCounts(),
      sources: emptyCounts(),
      citations: emptyCounts(),
    },
    createdLookups: { cities: [], networks: [], companies: [], venues: [] },
    confidence: { unverified: 0, single_source: 0, corroborated: 0, official: 0 },
    errors: [],
  };
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

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
 *
 * **These maps mean "resolved AND patched", not merely "id known".** That distinction is the
 * whole reason `Existing` below is a separate structure: filling these from the prefetch
 * would make every resolver short-circuit before its first-encounter UPDATE, and venue
 * addresses, city coordinates and network websites would stop being written with no counter
 * in `ImportReport` going anywhere near zero.
 */
type LookupCache = {
  cities: Map<string, string>;
  networks: Map<string, string>;
  companies: Map<string, string>;
  /** Venues carry a city too, so the memo has to hold both halves of the return. */
  venues: Map<string, { venueId: string; cityId: string | null }>;
  sources: Map<string, string>;
};

/**
 * Rows already in the database when the run started, from one bulk read per table.
 *
 * A hit here means "this exists and here is what it currently holds" — it does NOT mean the
 * run has reconciled it. The resolvers consult this to skip the per-row SELECT, then still
 * do their patch (or skip it, when the stored values already match).
 *
 * Keys: lookups by slug, sources by url, editions and viewership by `${productionId}:${year}`,
 * team by its UNIQUE-constraint tuple, citations by subject column + subject id + source +
 * field. Every key is the table's real write key, so a miss here and a miss in the database
 * are the same thing.
 */
type Existing = {
  cities: Map<string, Row<"cities">>;
  networks: Map<string, Row<"networks">>;
  companies: Map<string, Row<"companies">>;
  venues: Map<string, Row<"venues">>;
  productions: Map<string, Row<"productions">>;
  sources: Map<string, Row<"sources">>;
  editions: Map<string, Row<"editions">>;
  viewership: Map<string, Row<"viewership">>;
  team: Map<string, Row<"production_team">>;
  citations: Map<string, Row<"citations">>;
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

function emptyExisting(): Existing {
  return {
    cities: new Map(),
    networks: new Map(),
    companies: new Map(),
    venues: new Map(),
    productions: new Map(),
    sources: new Map(),
    editions: new Map(),
    viewership: new Map(),
    team: new Map(),
    citations: new Map(),
  };
}

/** Everything the per-record helpers need that is not the record itself. */
type Run = {
  db: Db;
  report: ImportReport;
  cache: LookupCache;
  existing: Existing;
  /**
   * Citations for subjects this run created, flushed in one insert at the end. A subject
   * that did not exist when the run started cannot have a citation, so these can never
   * conflict — which is what makes batching them safe without upsert semantics.
   */
  pendingCitations: Tables["citations"]["Insert"][];
  /** Every (production, editions) pair the run touched, for the one bulk confidence pass. */
  subjects: { productionId: string; editionIds: string[] }[];
};

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

/**
 * True when every key in `patch` already holds that value in `stored`.
 *
 * Numbers are compared through `Number()` deliberately: `cities.lat/lng` are `numeric(9,6)`
 * and `viewership.average_viewers` is `numeric`, and PostgREST can hand either back as a
 * string or a number depending on magnitude. A `===` here would report every coordinate as
 * changed forever and quietly undo the point of the check.
 */
function isNoOp(patch: object, stored: object | undefined): boolean {
  if (!stored) return false;
  const current_ = stored as Record<string, unknown>;
  return Object.entries(patch as Record<string, unknown>).every(([key, value]) => {
    const current = current_[key];
    if (value === null || current === null) return value === current;
    if (typeof value === "number" || typeof current === "number") {
      return Number(value) === Number(current);
    }
    return value === current;
  });
}

/** The slug a lookup row is written under. Shared so key collection cannot drift from resolution. */
function lookupSlug(input: { name: string; slug?: string | undefined }): string {
  return input.slug ?? slugify(input.name);
}

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

/**
 * Runs an `.in(...)` filter in chunks.
 *
 * PostgREST puts the filter in the query string and the Supabase proxy caps URL length at
 * roughly 8–16KB. Source URLs average ~110 characters, so a 60-record batch with six sources
 * each is well past that in one request — it fails as an opaque 414 rather than as anything
 * that names the cause. 50 for URLs, 200 for slugs and uuids.
 */
async function inChunks<T>(
  values: string[],
  size: number,
  fetchChunk: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(...(await fetchChunk(values.slice(i, i + size))));
  }
  return out;
}

const SLUG_CHUNK = 200;
const URL_CHUNK = 50;

// ---------------------------------------------------------------------------
// Prefetch
// ---------------------------------------------------------------------------

type BatchKeys = {
  productions: Set<string>;
  cities: Set<string>;
  venues: Set<string>;
  networks: Set<string>;
  companies: Set<string>;
  sourceUrls: Set<string>;
};

/**
 * Every write key the batch will touch, collected before a single query runs.
 *
 * Pure and database-free on purpose: a key this misses does not fail, it silently falls back
 * to the old per-row SELECT, so this is the function that has to be right by inspection.
 * Note the places a lookup hides — nested inside a venue, on an edition rather than the
 * production, on a team credit's company, and inside all four `sources` arrays.
 */
function collectKeys(records: ProductionInputT[]): BatchKeys {
  const keys: BatchKeys = {
    productions: new Set(),
    cities: new Set(),
    venues: new Set(),
    networks: new Set(),
    companies: new Set(),
    sourceUrls: new Set(),
  };

  const addCity = (city: CityInputT | null | undefined) => {
    if (city) keys.cities.add(lookupSlug(city));
  };
  const addVenue = (venue: VenueInputT | null | undefined) => {
    if (!venue) return;
    keys.venues.add(lookupSlug(venue));
    addCity(venue.city);
  };
  const addSources = (sources: SourceInputT[] | undefined) => {
    for (const source of sources ?? []) keys.sourceUrls.add(source.url);
  };

  for (const record of records) {
    keys.productions.add(lookupSlug(record));
    if (record.network) keys.networks.add(lookupSlug(record.network));
    if (record.production_company) keys.companies.add(lookupSlug(record.production_company));
    addCity(record.city);
    addVenue(record.venue);
    addSources(record.sources);

    for (const edition of record.editions ?? []) {
      addCity(edition.city);
      addVenue(edition.venue);
      if (edition.network) keys.networks.add(lookupSlug(edition.network));
      addSources(edition.sources);
    }
    for (const row of record.viewership ?? []) addSources(row.sources);
    for (const member of record.team ?? []) {
      if (member.company) keys.companies.add(lookupSlug(member.company));
      addSources(member.sources);
    }
  }

  return keys;
}

/** The citation key: subject column, subject id, source, and which fact it backs. */
function citationKey(
  column: "production_id" | "edition_id" | "viewership_id" | "team_id",
  subjectId: string,
  sourceId: string,
  field: string | null,
): string {
  return `${column}:${subjectId}|${sourceId}|${field ?? ""}`;
}

/** The `production_team` UNIQUE NULLS NOT DISTINCT tuple, as a string. */
function teamKey(
  productionId: string,
  editionId: string | null,
  role: string,
  companyId: string | null,
  personName: string | null,
): string {
  return [productionId, editionId ?? "", role, companyId ?? "", personName ?? ""].join("|");
}

/**
 * One bulk read per table, replacing the per-row SELECT that used to precede every write.
 *
 * Two waves: the first is keyed on slugs and urls taken straight from the payload, the
 * second on the production ids the first wave returned. Nothing here writes, so a prefetch
 * that comes back empty is simply a batch of entirely new records — the resolvers then take
 * their insert path without ever issuing the SELECT that would have confirmed the miss.
 */
async function prefetch(run: Run, records: ProductionInputT[]): Promise<void> {
  const { db, existing } = run;
  const keys = collectKeys(records);
  const ctx = "prefetch";

  /**
   * The five slug-keyed tables share one read shape, but not one row type. The client
   * resolves `.select("*")` per table name, so a union of five row types comes back and the
   * caller — which knows which table it asked for — narrows it. Hence one cast here rather
   * than five copies of the same six lines.
   */
  const bySlug = async (
    table: "cities" | "networks" | "companies" | "venues" | "productions",
    slugs: Set<string>,
    into: Map<string, never>,
  ) => {
    if (slugs.size === 0) return;
    const rows = await inChunks([...slugs], SLUG_CHUNK, async (chunk) => {
      const { data, error } = await db.from(table).select("*").in("slug", chunk);
      if (error) fail(ctx, `${table}: ${error.message}`);
      return (data ?? []) as unknown as { slug: string }[];
    });
    for (const row of rows) into.set(row.slug, row as never);
  };

  await Promise.all([
    bySlug("cities", keys.cities, existing.cities as unknown as Map<string, never>),
    bySlug("networks", keys.networks, existing.networks as unknown as Map<string, never>),
    bySlug("companies", keys.companies, existing.companies as unknown as Map<string, never>),
    bySlug("venues", keys.venues, existing.venues as unknown as Map<string, never>),
    bySlug("productions", keys.productions, existing.productions as unknown as Map<string, never>),
    (async () => {
      if (keys.sourceUrls.size === 0) return;
      const rows = await inChunks([...keys.sourceUrls], URL_CHUNK, async (chunk) => {
        const { data, error } = await db.from("sources").select("*").in("url", chunk);
        if (error) fail(ctx, `sources: ${error.message}`);
        return data ?? [];
      });
      for (const row of rows) existing.sources.set(row.url, row);
    })(),
  ]);

  // Wave 2 — everything hanging off a production that already exists. A brand-new production
  // has no editions, no viewership, no team and no citations by definition, so this is
  // correctly empty for a fresh batch.
  const productionIds = [...existing.productions.values()].map((p) => p.id);
  if (productionIds.length === 0) return;

  const [editions, viewership, team] = await Promise.all([
    inChunks(productionIds, SLUG_CHUNK, async (chunk) => {
      const { data, error } = await db.from("editions").select("*").in("production_id", chunk);
      if (error) fail(ctx, `editions: ${error.message}`);
      return data ?? [];
    }),
    inChunks(productionIds, SLUG_CHUNK, async (chunk) => {
      const { data, error } = await db.from("viewership").select("*").in("production_id", chunk);
      if (error) fail(ctx, `viewership: ${error.message}`);
      return data ?? [];
    }),
    inChunks(productionIds, SLUG_CHUNK, async (chunk) => {
      const { data, error } = await db.from("production_team").select("*").in("production_id", chunk);
      if (error) fail(ctx, `production_team: ${error.message}`);
      return data ?? [];
    }),
  ]);

  for (const row of editions) existing.editions.set(`${row.production_id}:${row.year}`, row);
  for (const row of viewership) existing.viewership.set(`${row.production_id}:${row.year}`, row);
  for (const row of team) {
    existing.team.set(
      teamKey(row.production_id, row.edition_id, row.role, row.company_id, row.person_name),
      row,
    );
  }

  // Citations, one read per subject column. `.or()` across four nullable columns would be one
  // request but produces a filter string that is harder to read than four obvious queries,
  // and the ids are already in hand.
  const subjectIds = {
    production_id: productionIds,
    edition_id: editions.map((e) => e.id),
    viewership_id: viewership.map((v) => v.id),
    team_id: team.map((t) => t.id),
  } as const;

  await Promise.all(
    (Object.keys(subjectIds) as (keyof typeof subjectIds)[]).map(async (column) => {
      const ids = subjectIds[column];
      if (ids.length === 0) return;
      const rows = await inChunks(ids, SLUG_CHUNK, async (chunk) => {
        const { data, error } = await db.from("citations").select("*").in(column, chunk);
        if (error) fail(ctx, `citations.${column}: ${error.message}`);
        return data ?? [];
      });
      for (const row of rows) {
        const subjectId = row[column];
        if (!subjectId) continue;
        existing.citations.set(citationKey(column, subjectId, row.source_id, row.field), row);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Lookup resolution — find by slug, else create. Provided non-undefined fields
// always win over what is already stored.
// ---------------------------------------------------------------------------

/**
 * All four resolvers below share one shape, deliberately written out rather than factored
 * into a generic: the Supabase client resolves `.update()` and `.insert()` payload types per
 * table name, and a helper generic over the table erases exactly the checking that catches a
 * column typo. Four near-copies that typecheck beat one abstraction that needs a cast.
 *
 * Three paths, in cost order: already resolved this run (free), known from the prefetch
 * (one UPDATE, or nothing at all when the patch is a no-op), or new (one INSERT). The
 * per-row SELECT that used to open every one of these is gone — `existing` answered it.
 */
async function resolveCity(run: Run, input: CityInputT): Promise<string> {
  const slug = lookupSlug(input);
  const cached = run.cache.cities.get(slug);
  if (cached) return cached;

  const { db, report } = run;
  const ctx = `city "${input.name}"`;

  const patch = definedOnly({
    name: input.name,
    state: input.state,
    country: input.country ?? undefined, // NOT NULL with a default — never write null
    timezone: input.timezone,
    lat: input.lat,
    lng: input.lng,
  });

  const stored = run.existing.cities.get(slug);
  if (stored) {
    if (!isNoOp(patch, stored)) {
      const { error } = await db.from("cities").update(patch).eq("id", stored.id);
      if (error) fail(ctx, error.message);
    }
    run.cache.cities.set(slug, stored.id);
    return stored.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("cities")
    .insert({ ...patch, name: input.name, slug })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.cities.push(`${input.name} (${slug})`);
  run.existing.cities.set(slug, inserted);
  run.cache.cities.set(slug, inserted.id);
  return inserted.id;
}

async function resolveNetwork(run: Run, input: NetworkInputT): Promise<string> {
  const slug = lookupSlug(input);
  const cached = run.cache.networks.get(slug);
  if (cached) return cached;

  const { db, report } = run;
  const ctx = `network "${input.name}"`;

  const patch = definedOnly({
    name: input.name,
    logo_url: input.logo_url,
    is_streaming: input.is_streaming, // NOT NULL with a default
    website: input.website,
  });

  const stored = run.existing.networks.get(slug);
  if (stored) {
    if (!isNoOp(patch, stored)) {
      const { error } = await db.from("networks").update(patch).eq("id", stored.id);
      if (error) fail(ctx, error.message);
    }
    run.cache.networks.set(slug, stored.id);
    return stored.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("networks")
    .insert({ ...patch, name: input.name, slug })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.networks.push(`${input.name} (${slug})`);
  run.existing.networks.set(slug, inserted);
  run.cache.networks.set(slug, inserted.id);
  return inserted.id;
}

async function resolveCompany(run: Run, input: CompanyInputT): Promise<string> {
  const slug = lookupSlug(input);
  const cached = run.cache.companies.get(slug);
  if (cached) return cached;

  const { db, report } = run;
  const ctx = `company "${input.name}"`;

  const patch = definedOnly({
    name: input.name,
    logo_url: input.logo_url,
    headquarters: input.headquarters,
    website: input.website,
  });

  const stored = run.existing.companies.get(slug);
  if (stored) {
    if (!isNoOp(patch, stored)) {
      const { error } = await db.from("companies").update(patch).eq("id", stored.id);
      if (error) fail(ctx, error.message);
    }
    run.cache.companies.set(slug, stored.id);
    return stored.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("companies")
    .insert({ ...patch, name: input.name, slug })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.companies.push(`${input.name} (${slug})`);
  run.existing.companies.set(slug, inserted);
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
  const slug = lookupSlug(input);
  const { db, report } = run;
  const ctx = `venue "${input.name}"`;

  const cityId = input.city ? await resolveCity(run, input.city) : fallbackCityId;

  // Cached only when this call adds no city the memo does not already carry. A venue first
  // seen without a city and seen again with one must still get its city_id written, which
  // is the normal shape when an early edition names only the venue.
  const cached = run.cache.venues.get(slug);
  if (cached && (cityId === null || cached.cityId === cityId)) return cached;

  const patch = definedOnly({
    name: input.name,
    address: input.address,
    capacity: input.capacity,
    website: input.website,
    city_id: cityId ?? undefined,
  });

  const stored = run.existing.venues.get(slug);

  if (stored) {
    if (!isNoOp(patch, stored)) {
      const { error: updateError } = await db.from("venues").update(patch).eq("id", stored.id);
      if (updateError) fail(ctx, updateError.message);
    }
    const resolved = { venueId: stored.id, cityId: cityId ?? stored.city_id };
    run.cache.venues.set(slug, resolved);
    return resolved;
  }

  const { data: inserted, error: insertError } = await db
    .from("venues")
    .insert({ ...patch, name: input.name, slug })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);

  report.createdLookups.venues.push(`${input.name} (${slug})`);
  run.existing.venues.set(slug, inserted);
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
 * Every source in the batch, resolved to an id in at most three round trips.
 *
 * Sources dedupe on `url`, which is the natural key and is UNIQUE in the schema. One
 * Deadline story backing eight records is one row cited eight times, so the
 * distinct-publisher count that drives confidence counts publishers rather than mentions.
 *
 * Three cases, kept apart deliberately:
 *
 *  - **New urls** — one insert with `ignoreDuplicates`, which compiles to `ON CONFLICT DO
 *    NOTHING`. It cannot clobber a row a concurrent run just created, and the re-select that
 *    follows picks up ids for anything the conflict skipped.
 *  - **Known urls whose payload actually differs** — one update each, with keys that already
 *    match the stored value dropped first. This is what preserves `definedOnly` semantics: a
 *    plain bulk `.upsert()` would write `null` over a stored title that this batch simply
 *    did not mention.
 *  - **Known urls with nothing new to say** — nothing at all, counted as `unchanged`.
 *
 * Where one url appears twice in a batch with different fields, first-defined wins. That is
 * exactly what the old per-record resolver did, since it memoised after the first encounter
 * and never revisited.
 */
async function prefetchSources(run: Run, records: ProductionInputT[]): Promise<void> {
  const { db, report, existing } = run;
  const ctx = "sources";

  const first = new Map<string, SourceInputT>();
  const collect = (sources: SourceInputT[] | undefined) => {
    for (const source of sources ?? []) if (!first.has(source.url)) first.set(source.url, source);
  };
  for (const record of records) {
    collect(record.sources);
    for (const edition of record.editions ?? []) collect(edition.sources);
    for (const row of record.viewership ?? []) collect(row.sources);
    for (const member of record.team ?? []) collect(member.sources);
  }
  if (first.size === 0) return;

  const fresh: Tables["sources"]["Insert"][] = [];
  const updates: { id: string; patch: Tables["sources"]["Update"] }[] = [];

  for (const [url, input] of first) {
    const patch = definedOnly({
      publisher: input.publisher,
      title: input.title,
      tier: input.tier,
      published_on: input.published_on,
    });
    const stored = existing.sources.get(url);

    if (!stored) {
      fresh.push({ ...patch, url, publisher: input.publisher, tier: input.tier });
    } else if (isNoOp(patch, stored)) {
      run.cache.sources.set(url, stored.id);
      report.summary.sources.unchanged += 1;
    } else {
      updates.push({ id: stored.id, patch });
      run.cache.sources.set(url, stored.id);
      report.summary.sources.updated += 1;
    }
  }

  if (fresh.length > 0) {
    const { error } = await db
      .from("sources")
      .upsert(fresh, { onConflict: "url", ignoreDuplicates: true });
    if (error) fail(ctx, error.message);

    // Re-select rather than trusting the insert's returning clause: with
    // `ignoreDuplicates` a row lost to a conflict comes back absent, not stale, and its id
    // still has to be known.
    const rows = await inChunks(
      fresh.map((f) => f.url),
      URL_CHUNK,
      async (chunk) => {
        const { data, error: selectError } = await db.from("sources").select("*").in("url", chunk);
        if (selectError) fail(ctx, selectError.message);
        return data ?? [];
      },
    );
    for (const row of rows) {
      run.cache.sources.set(row.url, row.id);
      existing.sources.set(row.url, row);
    }
    report.summary.sources.created += fresh.length;
  }

  for (const { id, patch } of updates) {
    const { error } = await db.from("sources").update(patch).eq("id", id);
    if (error) fail(ctx, error.message);
  }
}

/**
 * Attaches sources to one subject.
 *
 * Two paths. For a subject this run created, no citation can exist yet — the row is queued
 * for the batch insert at the end of the run, where a conflict is impossible by
 * construction. For a subject that was already in the database, the prefetched citation map
 * answers what the per-citation SELECT used to, and `retrieved_on` is refreshed only when it
 * actually moved. (That SELECT is also where the `.is` vs `.eq` null-matching trap lived:
 * three of four subject columns are null on every row, and `.eq(col, null)` is never true.)
 */
async function writeCitations(
  run: Run,
  subject: CitationSubject,
  subjectIsNew: boolean,
  inputs: SourceInputT[] | undefined,
): Promise<void> {
  if (!inputs?.length) return;
  const { db, report } = run;

  const [column, subjectId] = Object.entries(subject)[0] as [
    "production_id" | "edition_id" | "viewership_id" | "team_id",
    string,
  ];

  for (const input of inputs) {
    const sourceId = run.cache.sources.get(input.url);
    if (!sourceId) fail(`citation "${input.url}"`, "source was not resolved during prefetch");
    const field = input.field ?? null;

    if (subjectIsNew) {
      run.pendingCitations.push({
        ...subject,
        source_id: sourceId,
        field,
        retrieved_on: input.retrieved_on,
      });
      report.summary.citations.created += 1;
      continue;
    }

    const stored = run.existing.citations.get(citationKey(column, subjectId, sourceId, field));
    if (!stored) {
      run.pendingCitations.push({
        ...subject,
        source_id: sourceId,
        field,
        retrieved_on: input.retrieved_on,
      });
      report.summary.citations.created += 1;
      continue;
    }

    if (stored.retrieved_on === input.retrieved_on) {
      report.summary.citations.unchanged += 1;
      continue;
    }

    // retrieved_on is the one mutable fact: re-checking a source in a later pass is
    // exactly what the triple-check protocol does, and the new date is the useful one.
    const { error } = await db
      .from("citations")
      .update({ retrieved_on: input.retrieved_on })
      .eq("id", stored.id);
    if (error) fail(`citation "${input.url}"`, error.message);
    report.summary.citations.updated += 1;
  }
}

/**
 * Flushes the run's queued citations.
 *
 * Every row here attaches to a subject that either did not exist when the run started, or
 * had no citation for this (source, field) pair — so a plain insert cannot conflict with the
 * `citations_unique` index. Chunked because the payload, not the URL, is the size limit here.
 */
async function flushCitations(run: Run): Promise<void> {
  if (run.pendingCitations.length === 0) return;
  const { db } = run;
  for (let i = 0; i < run.pendingCitations.length; i += 500) {
    const { error } = await db.from("citations").insert(run.pendingCitations.slice(i, i + 500));
    if (error) fail("citations", error.message);
  }
  run.pendingCitations = [];
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

type CitationRow = { retrieved_on: string; sources: { tier: string; publisher: string } | null };

/**
 * Recomputes confidence for every production and edition the run touched, from what is
 * actually stored, and writes it. Runs once, after every other write in the batch.
 *
 * Derived rather than accepted from the payload on purpose. A tier a research batch can set
 * is a tier a hurried research batch will over-set, and "official" needs to mean the network
 * said so — not that someone was confident.
 *
 * The batching is arithmetic, not a change of rule: two reads instead of two per record, and
 * one UPDATE per distinct (confidence, verified_on) pair instead of one per row. A whole
 * batch retrieved on the same day collapses to about four writes per table. Rows whose
 * stored pair already matches are skipped entirely, so a second run writes nothing here.
 */
async function deriveConfidenceBulk(run: Run): Promise<void> {
  const { db, report, existing } = run;
  const ctx = "confidence";
  if (run.subjects.length === 0) return;

  const productionIds = run.subjects.map((s) => s.productionId);
  const editionIds = run.subjects.flatMap((s) => s.editionIds);

  const read = async (column: "production_id" | "edition_id", ids: string[]) => {
    const grouped = new Map<string, CitationRow[]>();
    if (ids.length === 0) return grouped;
    const rows = await inChunks(ids, SLUG_CHUNK, async (chunk) => {
      const { data, error } = await db
        .from("citations")
        // Must stay a single string literal — the Supabase client parses the select at the
        // type level, and a concatenation widens to `string`.
        .select("production_id, edition_id, retrieved_on, sources(tier, publisher)")
        .in(column, chunk);
      if (error) fail(ctx, error.message);
      return data ?? [];
    });
    for (const row of rows) {
      const id = row[column];
      if (!id) continue;
      grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }
    return grouped;
  };

  const [byProduction, byEdition] = await Promise.all([
    read("production_id", productionIds),
    read("edition_id", editionIds),
  ]);

  /** id -> the pair to write, grouped so identical pairs share one UPDATE. */
  const plan = (
    ids: string[],
    grouped: Map<string, CitationRow[]>,
    stored: Map<string, { confidence: string; verified_on: string | null }>,
  ) => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const rows = grouped.get(id) ?? [];
      const cited = rows.flatMap((r) => (r.sources ? [r.sources] : []));
      const confidence = rankConfidence(cited);
      const verifiedOn =
        rows.length === 0
          ? null
          : rows.reduce(
              (latest, r) => (r.retrieved_on > latest ? r.retrieved_on : latest),
              rows[0].retrieved_on,
            );

      report.confidence[confidence] += 1;

      const current = stored.get(id);
      if (current && current.confidence === confidence && current.verified_on === verifiedOn) {
        continue;
      }
      const key = `${confidence}|${verifiedOn ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    return groups;
  };

  const storedProductions = new Map(
    [...existing.productions.values()].map((p) => [p.id, p] as const),
  );
  const storedEditions = new Map([...existing.editions.values()].map((e) => [e.id, e] as const));

  const apply = async (table: "productions" | "editions", groups: Map<string, string[]>) => {
    for (const [key, ids] of groups) {
      const [confidence, verifiedOn] = key.split("|");
      const { error } = await db
        .from(table)
        .update({ confidence, verified_on: verifiedOn === "" ? null : verifiedOn })
        .in("id", ids);
      if (error) fail(ctx, error.message);
    }
  };

  await apply("productions", plan(productionIds, byProduction, storedProductions));
  await apply("editions", plan(editionIds, byEdition, storedEditions));
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

  const key = `${productionId}:${input.year}`;
  const stored = run.existing.editions.get(key);

  if (stored) {
    if (isNoOp(patch, stored)) {
      report.summary.editions.unchanged += 1;
    } else {
      const { error: updateError } = await db.from("editions").update(patch).eq("id", stored.id);
      if (updateError) fail(ctx, updateError.message);
      report.summary.editions.updated += 1;
    }
    await writeCitations(run, { edition_id: stored.id }, false, input.sources);
    return stored.id;
  }

  const { data: inserted, error: insertError } = await db
    .from("editions")
    .insert({ ...patch, production_id: productionId, year: input.year })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.editions.created += 1;
  // Registered so a later record in the same batch, and deriveConfidenceBulk, both see it.
  run.existing.editions.set(key, inserted);
  await writeCitations(run, { edition_id: inserted.id }, true, input.sources);
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
   * editions is the normal case, not the exception. The prefetch has already read every
   * edition of every production in the batch, so this no longer costs a round trip.
   */
  let editionId: string | null = null;
  if (input.year !== undefined) {
    editionId =
      editionIdsByYear.get(input.year) ??
      run.existing.editions.get(`${productionId}:${input.year}`)?.id ??
      null;
    if (editionId === null) fail(ctx, `no edition for year ${input.year} on this production`);
    editionIdsByYear.set(input.year, editionId);
  }

  // Companies resolve through the shared helper so vendors land in createdLookups and get
  // the same duplicate-name safety net as networks and cities.
  const companyId = input.company ? await resolveCompany(run, input.company) : null;
  const personName = input.person ?? null;

  const key = teamKey(productionId, editionId, input.role, companyId, personName);
  const stored = run.existing.team.get(key);
  const patch = definedOnly({ note: input.note, sort_order: input.sort_order });

  if (stored) {
    if (Object.keys(patch).length === 0 || isNoOp(patch, stored)) {
      report.summary.team.unchanged += 1;
    } else {
      const { error: updateError } = await db
        .from("production_team")
        .update(patch)
        .eq("id", stored.id);
      if (updateError) fail(ctx, updateError.message);
      report.summary.team.updated += 1;
    }
    await writeCitations(run, { team_id: stored.id }, false, input.sources);
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
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.team.created += 1;
  run.existing.team.set(key, inserted);
  await writeCitations(run, { team_id: inserted.id }, true, input.sources);
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

  const key = `${productionId}:${input.year}`;
  const stored = run.existing.viewership.get(key);

  if (stored) {
    if (isNoOp(patch, stored)) {
      report.summary.viewership.unchanged += 1;
    } else {
      const { error: updateError } = await db.from("viewership").update(patch).eq("id", stored.id);
      if (updateError) fail(ctx, updateError.message);
      report.summary.viewership.updated += 1;
    }
    await writeCitations(run, { viewership_id: stored.id }, false, input.sources);
    return;
  }

  const { data: inserted, error: insertError } = await db
    .from("viewership")
    .insert({ ...patch, production_id: productionId, year: input.year })
    .select("*")
    .single();
  if (insertError) fail(ctx, insertError.message);
  report.summary.viewership.created += 1;
  run.existing.viewership.set(key, inserted);
  await writeCitations(run, { viewership_id: inserted.id }, true, input.sources);
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

async function importRecord(run: Run, input: ProductionInputT): Promise<void> {
  const { db, report } = run;
  const slug = lookupSlug(input);
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

  const stored = run.existing.productions.get(slug);

  let productionId: string;
  let productionIsNew = false;
  if (stored) {
    if (isNoOp(patch, stored)) {
      report.summary.productions.unchanged += 1;
    } else {
      const { error: updateError } = await db.from("productions").update(patch).eq("id", stored.id);
      if (updateError) fail(ctx, updateError.message);
      report.summary.productions.updated += 1;
    }
    productionId = stored.id;
  } else {
    const { data: inserted, error: insertError } = await db
      .from("productions")
      // `slug` is written on create only — renames must never regenerate it.
      .insert({ ...patch, name: input.name, slug, category: input.category })
      .select("*")
      .single();
    if (insertError) fail(ctx, insertError.message);
    productionId = inserted.id;
    productionIsNew = true;
    // Registered so a second record with the same slug in one batch updates rather than
    // colliding, and so deriveConfidenceBulk can skip a no-op write.
    run.existing.productions.set(slug, inserted);
    report.summary.productions.created += 1;
  }

  await writeCitations(run, { production_id: productionId }, productionIsNew, input.sources);

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

  // Queued for the single confidence pass at the end of the run — over every edition the
  // record touched, including ones already in the database that this payload only added team
  // data to, since their citation set is unchanged but their tally still belongs in the report.
  run.subjects.push({ productionId, editionIds: [...editionIdsByYear.values()] });
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
 * Four phases: validate every record, read everything the batch will touch in one bulk pass,
 * write record by record, then derive confidence once over the whole run.
 *
 * Validation is per-record, not per-batch, and deliberately so: in a 60-record research
 * batch, one bad field should not send the other 59 back for a re-paste. A record that
 * fails validation is never written and is reported with the exact field path.
 *
 * Records are written sequentially, and that is not an oversight. Two records racing to
 * create the network "Netflix" would both miss the cache and both insert; the prefetch, not
 * concurrency, is where the time went.
 *
 * Note that Supabase's REST client has no multi-statement transaction, so a record that
 * fails partway through writing can leave its lookup rows behind. That is safe here
 * because every write is keyed on a stable slug or (production_id, year) — fix the record,
 * run the batch again, and the result converges.
 */
export async function runImport(db: Db, records: unknown[]): Promise<ImportReport> {
  const report = emptyReport(records.length);
  // One cache for the whole batch — see LookupCache. Scoped to the run rather than the
  // module so a long-lived serverless instance never serves a stale id after a manual edit.
  const run: Run = {
    db,
    report,
    cache: emptyCache(),
    existing: emptyExisting(),
    pendingCitations: [],
    subjects: [],
  };

  const valid: { index: number; record: ProductionInputT }[] = [];
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
    valid.push({ index, record: parsed.data });
  }

  if (valid.length === 0) return report;

  const parsedRecords = valid.map((v) => v.record);
  await prefetch(run, parsedRecords);
  await prefetchSources(run, parsedRecords);

  for (const { index, record } of valid) {
    try {
      await importRecord(run, record);
    } catch (cause) {
      report.ok = false;
      report.errors.push({
        index,
        name: record.name,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  // Both run even when a record failed: the citations already queued belong to records that
  // succeeded, and leaving them unflushed would report created rows that were never written.
  await flushCitations(run);
  await deriveConfidenceBulk(run);

  return report;
}
