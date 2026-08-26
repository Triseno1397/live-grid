/**
 * Live Grid — fill the columns seeding leaves null.
 *
 * `npm run enrich -- cities [--dry] [--limit N] [--force]`
 * `npm run enrich -- venues`
 *
 * Seeding produces facts a researcher can source: who makes the show, where it tapes, when.
 * It does not produce coordinates, and it rarely produces a venue's seated capacity, because
 * neither is a claim anyone is citing a trade story for. Those columns exist in the schema —
 * `cities.lat/lng` are what Phase 3's map needs — and they are null on almost every row.
 *
 * Wikidata knows them. This matches Live Grid rows to Wikidata items and fills the gaps.
 *
 * ## Four rules, and the reasons
 *
 * 1. **Fills nulls, never overwrites.** A value a researcher sourced beats a value a query
 *    matched by name. `--force` exists and has to be typed.
 *
 * 2. **Match or skip, never guess.** More than one plausible item after the hints are applied
 *    and the row is skipped and reported. This is AGENTS.md's "a null is honest, a guess is
 *    not" made mechanical. It matters most exactly where it is most tempting: there are
 *    Springfields in thirty-four states, and a coordinate is a fact that looks equally
 *    confident whichever one it came from.
 *
 * 3. **Idempotent.** Each pass selects only rows whose target column is null, so a second run
 *    reports zero fills and the third is free.
 *
 * 4. **Provenance goes to `external_ids`, not `citations`.** `citations` attaches to a
 *    production, edition, viewership row or team credit — there is no subject column for a
 *    city, and adding one would be claiming that a coordinate is the kind of fact the
 *    confidence system exists to rank. It is not. "This city row is Wikidata Q65, matched on
 *    2026-08-26" is the honest record, it is followable, and it is what makes the NEXT run a
 *    lookup rather than another name match.
 */

import type { Database } from "../../src/lib/supabase/database.types";
import { createServiceClient } from "../../src/lib/supabase/service";
import { firstLabel, parsePoint, qid, runQuery, type SparqlRow } from "../discover/sparql";

type Db = ReturnType<typeof createServiceClient>;
type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

const TODAY = new Date().toISOString().slice(0, 10);

type Options = { dry: boolean; limit: number | null; force: boolean };

type Report = {
  examined: number;
  filled: number;
  /** Rows deliberately left alone, with the reason. The interesting half of the output. */
  skipped: { name: string; reason: string }[];
};

function emptyReport(): Report {
  return { examined: 0, filled: 0, skipped: [] };
}

/** Escapes a label for a SPARQL string literal. */
function literal(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@en`;
}

/**
 * Records the identifier a match resolved to.
 *
 * Written even on a dry run's real counterpart only — never speculatively — because the row
 * is the claim "we decided this is that entity", and a run that decided nothing should not
 * leave one behind.
 */
async function recordExternalId(
  db: Db,
  column: "city_id" | "venue_id" | "network_id" | "company_id" | "production_id",
  subjectId: string,
  externalId: string,
): Promise<void> {
  const row: Database["public"]["Tables"]["external_ids"]["Insert"] = {
    source: "wikidata",
    external_id: externalId,
    retrieved_on: TODAY,
    // Written by name rather than a computed key: the check constraint allows exactly one
    // subject column, and a computed key erases the type that enforces which ones exist.
    production_id: column === "production_id" ? subjectId : null,
    city_id: column === "city_id" ? subjectId : null,
    venue_id: column === "venue_id" ? subjectId : null,
    network_id: column === "network_id" ? subjectId : null,
    company_id: column === "company_id" ? subjectId : null,
  };

  const { error } = await db.from("external_ids").upsert(
    row,
    // Matches external_ids_subject_unique. A re-run updates retrieved_on rather than
    // colliding, which is what makes the whole script safe to run twice.
    { onConflict: "source,production_id,city_id,venue_id,network_id,company_id" },
  );
  // A conflict on external_ids_identity_unique (two subjects claiming one Q-id) is a real
  // finding, not a crash: report it and leave both rows alone.
  if (error && !error.message.includes("external_ids_identity_unique")) {
    throw new Error(`external_ids: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Cities — coordinates and timezone
// ---------------------------------------------------------------------------

/**
 * Candidate items for a batch of city names, with everything needed to tell them apart.
 *
 * `wdt:P31` against an explicit class list rather than `P31/P279*`: the subclass walk is what
 * times WDQS out (see `discover/queries.ts`), and three classes cover what a broadcast
 * database's city column actually contains.
 */
function cityQuery(names: string[]): string {
  return `SELECT ?item ?label ?coord ?countryLabel ?adminLabel ?tzLabel WHERE {
  VALUES ?label { ${names.map(literal).join(" ")} }
  ?item rdfs:label ?label .
  VALUES ?class { wd:Q515 wd:Q1093829 wd:Q486972 }
  ?item wdt:P31 ?class .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P131 ?admin . }
  OPTIONAL { ?item wdt:P421 ?tz . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

/** IANA zone names as Wikidata labels them, mapped to what the schema stores. */
const TZ_LABELS: Record<string, string> = {
  "UTC−05:00": "America/New_York",
  "UTC−06:00": "America/Chicago",
  "UTC−07:00": "America/Denver",
  "UTC−08:00": "America/Los_Angeles",
};

async function enrichCities(db: Db, opts: Options): Promise<Report> {
  const report = emptyReport();

  let query = db
    .from("cities")
    .select("id, name, slug, state, country, lat, lng, timezone")
    .order("slug");
  if (!opts.force) query = query.is("lat", null);
  if (opts.limit) query = query.limit(opts.limit);

  const { data: rows, error } = await query;
  if (error) throw new Error(`cities: ${error.message}`);
  report.examined = rows?.length ?? 0;
  if (!rows?.length) return report;

  const byName = new Map<string, SparqlRow[]>();
  const names = [...new Set(rows.map((r) => r.name))];
  for (let i = 0; i < names.length; i += 40) {
    for (const row of await runQuery(cityQuery(names.slice(i, i + 40)))) {
      const label = row.label?.value;
      if (label) byName.set(label, [...(byName.get(label) ?? []), row]);
    }
  }

  for (const row of rows) {
    const candidates = byName.get(row.name) ?? [];
    if (candidates.length === 0) {
      report.skipped.push({ name: row.name, reason: "no Wikidata item with coordinates" });
      continue;
    }

    /**
     * The disambiguation, and the only interesting part of this script.
     *
     * A city name alone is not an identifier. The row already carries `state` and `country`,
     * which is exactly the evidence needed — an item survives only if it agrees with what is
     * already stored. Nothing survives, or more than one does, and the row is skipped.
     */
    const hint = (row.state ?? "").toLowerCase();
    const country = (row.country ?? "").toLowerCase();
    const matches = candidates.filter((c) => {
      const admin = (firstLabel([c], "adminLabel") ?? "").toLowerCase();
      const itemCountry = (firstLabel([c], "countryLabel") ?? "").toLowerCase();
      if (hint !== "" && admin !== "" && !admin.includes(hint) && !hint.includes(admin)) {
        // A US state hint against a county-level admin ("Los Angeles County") will not match
        // the two-letter code, so fall back to the country check rather than rejecting.
        if (country !== "" && itemCountry !== "") {
          return itemCountry.includes(country) || countryAlias(country, itemCountry);
        }
        return false;
      }
      if (country !== "" && itemCountry !== "") {
        return itemCountry.includes(country) || countryAlias(country, itemCountry);
      }
      return true;
    });

    const distinct = new Map(matches.map((m) => [m.item?.value ?? "", m]));
    if (distinct.size === 0) {
      report.skipped.push({ name: row.name, reason: `no candidate agreed with state "${row.state ?? "—"}"` });
      continue;
    }
    if (distinct.size > 1) {
      const labels = [...distinct.values()]
        .map((m) => firstLabel([m], "adminLabel") ?? firstLabel([m], "countryLabel") ?? "?")
        .join(", ");
      report.skipped.push({
        name: row.name,
        reason: `${distinct.size} plausible items (${labels}) — ambiguous, left alone`,
      });
      continue;
    }

    const match = [...distinct.values()][0];
    const coords = parsePoint(match.coord?.value);
    if (!coords) {
      report.skipped.push({ name: row.name, reason: "coordinate did not parse" });
      continue;
    }

    const tzLabel = firstLabel([match], "tzLabel");
    const patch: Update<"cities"> = {};
    if (opts.force || row.lat === null) patch.lat = coords.lat;
    if (opts.force || row.lng === null) patch.lng = coords.lng;
    if (row.timezone === null && tzLabel && TZ_LABELS[tzLabel]) patch.timezone = TZ_LABELS[tzLabel];

    if (Object.keys(patch).length === 0) continue;

    if (!opts.dry) {
      const { error: updateError } = await db.from("cities").update(patch).eq("id", row.id);
      if (updateError) throw new Error(`cities.${row.slug}: ${updateError.message}`);
      await recordExternalId(db, "city_id", row.id, qid(match.item?.value ?? ""));
    }
    report.filled += 1;
    console.log(
      `    ${row.name}${row.state ? `, ${row.state}` : ""} → ${coords.lat}, ${coords.lng}` +
        `${patch.timezone ? ` · ${patch.timezone}` : ""}  (${qid(match.item?.value ?? "")})`,
    );
  }

  return report;
}

/** "USA" and "United States of America" are the same country and neither contains the other. */
function countryAlias(stored: string, wikidata: string): boolean {
  const us = ["usa", "us", "united states", "united states of america"];
  return us.includes(stored) && us.some((v) => wikidata.includes(v));
}

// ---------------------------------------------------------------------------
// Venues — capacity, website, and the city they sit in
// ---------------------------------------------------------------------------

/**
 * Candidates for a batch of venue names.
 *
 * **No class constraint, deliberately.** The first version filtered on `P31` against five
 * venue-ish classes and matched 9 of 60 — Shrine Auditorium, the Hollywood Palladium, MGM
 * Grand Garden Arena and the United States Capitol all came back as "no Wikidata item",
 * because Wikidata types them as concert hall, music venue, indoor arena and seat of
 * government rather than as anything on the list. Enumerating every class a room can be is a
 * losing game.
 *
 * What actually distinguishes a place from a film with the same name is a **coordinate**, so
 * that is the filter: `wdt:P625` required, class ignored. Recall goes up and precision does
 * not go down, because the disambiguation that matters happens against `P131` — the venue row
 * already knows its city, and that is far stronger evidence than a class ever was.
 */
function venueQuery(names: string[]): string {
  return `SELECT ?item ?label ?capacity ?website ?cityLabel ?adminLabel ?countryLabel WHERE {
  VALUES ?label { ${names.map(literal).join(" ")} }
  ?item rdfs:label ?label .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P1083 ?capacity . }
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL { ?item wdt:P131 ?city . ?city rdfs:label ?cityLabel . FILTER(LANG(?cityLabel) = "en") }
  OPTIONAL { ?item wdt:P131/wdt:P131 ?admin . }
  OPTIONAL { ?item wdt:P17 ?country . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

async function enrichVenues(db: Db, opts: Options): Promise<Report> {
  const report = emptyReport();

  // The venue's city comes along for the ride: it is the disambiguator, and without it a
  // name match is a coin flip on anything called "The Coliseum".
  let query = db
    .from("venues")
    // Must stay a single string literal — the client parses the select at the type level.
    .select("id, name, slug, capacity, website, city_id, cities(name, state)")
    .order("slug");
  if (!opts.force) query = query.is("capacity", null);
  if (opts.limit) query = query.limit(opts.limit);

  const { data: rows, error } = await query;
  if (error) throw new Error(`venues: ${error.message}`);
  report.examined = rows?.length ?? 0;
  if (!rows?.length) return report;

  const byName = new Map<string, SparqlRow[]>();
  const names = [...new Set(rows.map((r) => r.name))];
  for (let i = 0; i < names.length; i += 40) {
    for (const row of await runQuery(venueQuery(names.slice(i, i + 40)))) {
      const label = row.label?.value;
      if (label) byName.set(label, [...(byName.get(label) ?? []), row]);
    }
  }

  for (const row of rows) {
    const candidates = byName.get(row.name) ?? [];
    const all = new Map(candidates.map((c) => [c.item?.value ?? "", c]));

    if (all.size === 0) {
      report.skipped.push({ name: row.name, reason: "no Wikidata item with coordinates" });
      continue;
    }

    /**
     * Narrow by the city the venue is already recorded in.
     *
     * Only applied when it helps: if the hint eliminates everything, the name match is kept
     * and the ambiguity check below decides. Wikidata's `P131` is frequently a borough or a
     * county rather than the city a broadcast database would name — "Manhattan" for a New
     * York venue, "Los Angeles County" for one in Inglewood — so an exact city match is
     * evidence in favour and its absence is not evidence against.
     */
    const cityName = (row.cities?.name ?? "").toLowerCase();
    const narrowed =
      cityName === ""
        ? all
        : new Map(
            [...all].filter(([, c]) => {
              const candidateCity = (firstLabel([c], "cityLabel") ?? "").toLowerCase();
              const admin = (firstLabel([c], "adminLabel") ?? "").toLowerCase();
              return (
                candidateCity.includes(cityName) ||
                cityName.includes(candidateCity) ||
                admin.includes(cityName)
              );
            }),
          );

    const distinct = narrowed.size > 0 ? narrowed : all;

    if (distinct.size > 1) {
      // Venue names get reused — several Coliseums, a Waldorf Astoria in two cities. When the
      // city hint cannot separate them, skipping is right and cheap.
      const where = [...distinct.values()]
        .map((c) => firstLabel([c], "cityLabel") ?? firstLabel([c], "countryLabel") ?? "?")
        .join(", ");
      report.skipped.push({
        name: row.name,
        reason: `${distinct.size} plausible items (${where}) — ambiguous`,
      });
      continue;
    }

    const match = [...distinct.values()][0];
    const capacity = Number(match.capacity?.value);
    const website = match.website?.value;

    const patch: Update<"venues"> = {};
    if ((opts.force || row.capacity === null) && Number.isFinite(capacity) && capacity > 0) {
      patch.capacity = Math.round(capacity);
    }
    if (row.website === null && website) patch.website = website;

    if (Object.keys(patch).length === 0) {
      report.skipped.push({ name: row.name, reason: "matched, but Wikidata has nothing to add" });
      continue;
    }

    if (!opts.dry) {
      const { error: updateError } = await db.from("venues").update(patch).eq("id", row.id);
      if (updateError) throw new Error(`venues.${row.slug}: ${updateError.message}`);
      await recordExternalId(db, "venue_id", row.id, qid(match.item?.value ?? ""));
    }
    report.filled += 1;
    console.log(
      `    ${row.name} → ${patch.capacity ? `capacity ${patch.capacity}` : ""}` +
        `${patch.website ? `  ${patch.website}` : ""}  (${qid(match.item?.value ?? "")})`,
    );
  }

  return report;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const what = argv.find((a) => !a.startsWith("--"));
  const opts: Options = {
    dry: argv.includes("--dry"),
    force: argv.includes("--force"),
    limit: argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : null,
  };

  if (what !== "cities" && what !== "venues") {
    console.error("Usage: npm run enrich -- <cities|venues> [--dry] [--limit N] [--force]");
    process.exit(1);
  }

  const db = createServiceClient();
  console.log(
    `Enriching ${what}${opts.dry ? " (dry run — nothing will be written)" : ""}…\n`,
  );

  const report = what === "cities" ? await enrichCities(db, opts) : await enrichVenues(db, opts);

  if (report.skipped.length > 0) {
    console.log(`\n  Skipped (${report.skipped.length}) — left alone rather than guessed:`);
    for (const s of report.skipped) console.log(`    ${s.name}: ${s.reason}`);
  }

  console.log(
    `\n${report.examined} examined · ${report.filled} filled · ${report.skipped.length} skipped` +
      (opts.dry ? "  (dry run — nothing written)" : ""),
  );
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
