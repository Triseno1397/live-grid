/**
 * Live Grid — recompute stored confidence from stored citations.
 *
 * Run with `npm run seeds:rederive -- [--dry]`.
 *
 * `confidence` is derived, not asserted — but it is derived *at import time*, so a change to
 * the rule leaves every row that was imported under the old one holding a stale answer. This
 * is the migration for that: read every citation, re-rank, and write what differs.
 *
 * It is deliberately a separate script rather than something the importer does. Re-deriving
 * the whole corpus on every batch would be slow and would hide the one moment that matters —
 * the run where a rule change moves rows. `--dry` prints that diff without writing.
 *
 * Expected output after a behaviour-preserving change: **0 changed**. Anything else is a
 * finding to read, not a number to accept.
 */

import { CONFIDENCE_LEVELS } from "../src/lib/import/schema";
import { publisherKey } from "../src/lib/url";
import { createServiceClient } from "../src/lib/supabase/service";

type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Kept byte-identical to `rankConfidence` in `src/lib/import/importer.ts`.
 *
 * Duplicated rather than exported because exporting it would make the importer's internals
 * part of a public surface for the sake of one script. If the rule changes, both change —
 * and this script's whole job is to be run at exactly that moment, so the duplication is
 * self-correcting in a way a stale import would not be.
 */
function rankConfidence(rows: { tier: string; publisher: string; url: string }[]): Confidence {
  if (rows.length === 0) return "unverified";

  const publishers = new Set(rows.map((r) => publisherKey(r.url, r.publisher)));
  const hasOfficial = rows.some((r) => r.tier === "official");
  const hasNonReference = rows.some((r) => r.tier !== "reference");

  if (hasOfficial && publishers.size >= 2) return "official";
  if (publishers.size >= 2 && hasNonReference) return "corroborated";
  return "single_source";
}

type Cited = { retrieved_on: string; sources: { tier: string; publisher: string; url: string } | null };

async function main(): Promise<void> {
  const dry = process.argv.slice(2).includes("--dry");
  const db = createServiceClient();

  let changed = 0;
  let examined = 0;

  for (const table of ["productions", "editions"] as const) {
    const column = table === "productions" ? "production_id" : "edition_id";

    const { data: rows, error } = await db.from(table).select("id, name:id, confidence, verified_on");
    if (error) throw new Error(`${table}: ${error.message}`);

    // One read for every citation attached to this subject type. At corpus scale this is a
    // few thousand rows — small enough that grouping in memory beats a query per subject by
    // three orders of magnitude, which is the same trade deriveConfidenceBulk makes.
    const { data: citations, error: citationError } = await db
      .from("citations")
      // Must stay a single string literal — the client parses the select at the type level.
      .select("production_id, edition_id, retrieved_on, sources(tier, publisher, url)")
      .not(column, "is", null);
    if (citationError) throw new Error(`citations: ${citationError.message}`);

    const grouped = new Map<string, Cited[]>();
    for (const row of citations ?? []) {
      const id = row[column];
      if (!id) continue;
      grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }

    /** Grouped so identical (confidence, verified_on) pairs share one UPDATE. */
    const plan = new Map<string, string[]>();

    for (const row of rows ?? []) {
      examined += 1;
      const cited = grouped.get(row.id) ?? [];
      const confidence = rankConfidence(cited.flatMap((c) => (c.sources ? [c.sources] : [])));
      const verifiedOn =
        cited.length === 0
          ? null
          : cited.reduce(
              (latest, c) => (c.retrieved_on > latest ? c.retrieved_on : latest),
              cited[0].retrieved_on,
            );

      if (row.confidence === confidence && row.verified_on === verifiedOn) continue;

      changed += 1;
      console.log(
        `  ${table.slice(0, -1)} ${row.id}: ` +
          `${row.confidence}/${row.verified_on ?? "—"} → ${confidence}/${verifiedOn ?? "—"}`,
      );
      const key = `${confidence}|${verifiedOn ?? ""}`;
      plan.set(key, [...(plan.get(key) ?? []), row.id]);
    }

    if (dry) continue;

    for (const [key, ids] of plan) {
      const [confidence, verifiedOn] = key.split("|");
      const { error: updateError } = await db
        .from(table)
        .update({ confidence, verified_on: verifiedOn === "" ? null : verifiedOn })
        .in("id", ids);
      if (updateError) throw new Error(`${table} update: ${updateError.message}`);
    }
  }

  console.log(
    `\n${examined} subject(s) examined, ${changed} changed` +
      (dry ? " (dry run — nothing written)." : "."),
  );
  if (changed === 0) {
    console.log("The stored confidence already matches the current rule.");
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
