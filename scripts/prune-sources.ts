/**
 * Live Grid — sources the seed corpus no longer cites.
 *
 * Run with `npm run seeds:prune` to report, `-- --apply` to delete.
 *
 * The importer is additive, deliberately: a batch adds citations, it never removes ones it
 * does not mention, because batch 006 hangs team credits on a production whose citations came
 * from batch 001 and a pruning importer would delete them. The cost of that is a ghost —
 * correct a rotted URL in a seed file and the OLD source row stays behind, still counted in
 * the sources total, still attached to its subject, still reading as provenance.
 *
 * `npm run seeds:links` produces that situation every time it catches a dead link, so this is
 * its other half. The rule is narrow and checkable: a source whose url appears in no seed
 * file is not backing anything the corpus claims. Deleting it cascades to its citations, so
 * run `npm run seeds:rederive` afterwards — the report says so too.
 *
 * Dry by default. `--apply` is a deliberate act, because a source imported ad hoc through
 * /admin/import rather than from a seed file looks identical to a ghost from here, and the
 * report is what lets a person tell them apart before anything is deleted.
 */

import { allSourcesOf, loadSeedRecords } from "./lib/seeds";
import { createServiceClient } from "../src/lib/supabase/service";

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes("--apply");
  const db = createServiceClient();

  const { loaded, errors } = loadSeedRecords();
  if (errors.length > 0) {
    for (const problem of errors) {
      console.error(`  ${problem.file} — ${problem.record}: ${problem.message}`);
    }
    console.error("\nSeed files did not all parse. Fix them before pruning — a file that failed");
    console.error("to load looks exactly like a file whose citations were all removed.");
    process.exit(1);
  }

  const cited = new Set<string>();
  for (const { record } of loaded) {
    for (const source of allSourcesOf(record)) {
      if (typeof source.url === "string") cited.add(source.url);
    }
  }

  const { data: stored, error } = await db.from("sources").select("id, url, publisher, tier");
  if (error) throw new Error(`sources: ${error.message}`);

  const ghosts = (stored ?? []).filter((row) => !cited.has(row.url));

  console.log(
    `${cited.size} url(s) cited across ${loaded.length} seed records; ` +
      `${stored?.length ?? 0} source row(s) in the database.`,
  );

  if (ghosts.length === 0) {
    console.log("\nEvery stored source is cited by a seed file. Nothing to prune.");
    return;
  }

  // How many citations each ghost is currently propping up — the number that says whether
  // this is a harmless leftover or something a subject is still leaning on.
  const { data: citations, error: citationError } = await db.from("citations").select("source_id");
  if (citationError) throw new Error(`citations: ${citationError.message}`);
  const uses = new Map<string, number>();
  for (const row of citations ?? []) {
    uses.set(row.source_id, (uses.get(row.source_id) ?? 0) + 1);
  }

  console.log(`\n${ghosts.length} source(s) cited by no seed file:`);
  for (const ghost of ghosts) {
    console.log(`  ${ghost.publisher} · ${ghost.tier} · ${uses.get(ghost.id) ?? 0} citation(s)`);
    console.log(`    ${ghost.url}`);
  }

  if (!apply) {
    console.log(
      "\nDry run — nothing deleted. Check that none of these came in through /admin/import\n" +
        "rather than a seed file, then re-run with --apply.",
    );
    return;
  }

  // citations.source_id is ON DELETE CASCADE, so this takes the citations with it.
  const { error: deleteError } = await db
    .from("sources")
    .delete()
    .in(
      "id",
      ghosts.map((g) => g.id),
    );
  if (deleteError) throw new Error(`delete: ${deleteError.message}`);

  console.log(`\nDeleted ${ghosts.length} source(s) and their citations.`);
  console.log("Run `npm run seeds:rederive` — confidence is derived from citations that just changed.");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
