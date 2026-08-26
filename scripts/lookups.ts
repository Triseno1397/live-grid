/**
 * Live Grid — the lookup vocabulary already in the database.
 *
 * Run with `npm run seeds:lookups` before writing a batch, or `-- --json` to pipe it.
 *
 * Networks, companies, cities and venues are created on demand by the importer, keyed on
 * slug. That is what makes batches converge instead of colliding — and it is also how a fork
 * happens: one batch writes "Netflix", another writes "Netflix (US)", both are valid records,
 * and the result is two rows with the productions split between them. Nothing errors, because
 * nothing is wrong; they are simply two different names.
 *
 * `checkLookupNames` in `check-seeds.ts` catches the near-misses after the fact. This is the
 * before: the list to paste from, so the question never comes up. Generated, never
 * hand-maintained — a hand-maintained vocabulary is one more thing that drifts.
 */

import { createServiceClient } from "../src/lib/supabase/service";

async function main(): Promise<void> {
  const json = process.argv.slice(2).includes("--json");
  const db = createServiceClient();

  const [networks, companies, cities, venues] = await Promise.all([
    db.from("networks").select("name, slug, is_streaming").order("slug"),
    db.from("companies").select("name, slug").order("slug"),
    db.from("cities").select("name, slug, state, country").order("slug"),
    db.from("venues").select("name, slug, city_id").order("slug"),
  ]);

  for (const result of [networks, companies, cities, venues]) {
    if (result.error) throw new Error(result.error.message);
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          networks: networks.data,
          companies: companies.data,
          cities: cities.data,
          venues: venues.data,
        },
        null,
        2,
      ),
    );
    return;
  }

  const section = (label: string, rows: { name: string; slug: string }[], suffix?: (row: never) => string) => {
    console.log(`\n${label} (${rows.length})`);
    for (const row of rows) {
      const extra = suffix ? suffix(row as never) : "";
      console.log(`  ${row.slug.padEnd(34)} ${row.name}${extra}`);
    }
  };

  console.log("Use these names verbatim. A new name creates a new row.");
  section("NETWORKS", networks.data ?? [], (row: { is_streaming: boolean }) =>
    row.is_streaming ? "  (streaming)" : "",
  );
  section("COMPANIES", companies.data ?? []);
  section("CITIES", cities.data ?? [], (row: { state: string | null; country: string }) =>
    row.state ? `, ${row.state}` : row.country !== "USA" ? `, ${row.country}` : "",
  );
  section("VENUES", venues.data ?? []);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
