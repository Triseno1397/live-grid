/**
 * Live Grid — seed importer, from the command line.
 *
 * Run with `npm run seeds:import -- <files|dirs|globs> [flags]`.
 *
 * This is the default import path; `/admin/import` is the browser fallback. Both call the
 * same `runImport`, so there is one write path and the route stays a thin wrapper (AGENTS.md
 * rule 3). What moving to a CLI buys:
 *
 *  - **No 300s ceiling.** `maxDuration` on the Vercel route is what capped batches at 25
 *    records. Locally there is no clock, so a batch is sized by what makes one reviewable
 *    diff, not by what fits in a serverless invocation.
 *  - **`--verify` is machine-checked.** `seeds/PROGRESS.md` asks a human to re-paste each
 *    batch and eyeball "0 created / N updated, empty createdLookups". A human does that
 *    correctly for the first few batches. This asserts it and exits non-zero.
 *  - **No paste.** A 60-record batch is ~120KB of JSON.
 *
 * Exit code 1 on any record error or idempotency violation, so it composes into a script.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { runImport, type ImportReport } from "../src/lib/import/importer";
import { ImportEnvelope, ProductionInput } from "../src/lib/import/schema";
import { createServiceClient } from "../src/lib/supabase/service";

type Args = {
  inputs: string[];
  /** Validate only. Never constructs a client, so it needs no credentials. */
  dry: boolean;
  /** Import, then re-import the same records and assert nothing was created. */
  verify: boolean;
  /** Take only the first N records. For bisecting a batch that fails partway. */
  limit: number | null;
  /** Emit the raw ImportReport as JSON instead of the human summary. */
  json: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { inputs: [], dry: false, verify: false, limit: null, json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry") args.dry = true;
    else if (arg === "--verify") args.verify = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--limit") {
      const value = Number(argv[(i += 1)]);
      if (!Number.isInteger(value) || value < 1) fail(`--limit needs a positive integer`);
      args.limit = value;
    } else if (arg.startsWith("--")) fail(`Unknown flag: ${arg}`);
    else args.inputs.push(arg);
  }

  if (args.inputs.length === 0) {
    fail(
      "Usage: npm run seeds:import -- <files|dirs|globs> [--dry] [--verify] [--limit N] [--json]\n" +
        "  e.g. npm run seeds:import -- seeds/010-reality-live.json --verify\n" +
        "       npm run seeds:import -- seeds --dry",
    );
  }
  return args;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Files, directories and globs all resolve to a sorted file list.
 *
 * Git Bash on Windows expands globs before the process sees them, PowerShell does not, so
 * both an already-expanded list and a literal `seeds/01*.json` have to work. Directories
 * mean "the .json files directly inside", not a recursive walk — `seeds/candidates/` holds
 * Wikidata discovery output in a different shape and must never be swept up by
 * `seeds:import -- seeds`.
 */
function resolveInputs(inputs: string[]): string[] {
  const files = new Set<string>();

  for (const input of inputs) {
    if (input.includes("*")) {
      const matches = expandGlob(input);
      if (matches.length === 0) fail(`No files matched: ${input}`);
      for (const match of matches) files.add(match);
      continue;
    }

    let stat;
    try {
      stat = statSync(input);
    } catch {
      fail(`No such file or directory: ${input}`);
    }

    if (stat.isDirectory()) {
      const entries = readdirSync(input).filter((f) => f.endsWith(".json"));
      if (entries.length === 0) fail(`No .json files in ${input}`);
      for (const entry of entries) files.add(join(input, entry));
    } else {
      files.add(input);
    }
  }

  return [...files].sort();
}

/**
 * Single-directory `*` matching — `seeds/01*.json`, not `seeds/**​/*.json`.
 *
 * `node:fs.globSync` exists on this Node but not in the `@types/node` the project pins, and
 * a version bump to get one regex is a poor trade. Recursion is not wanted here anyway:
 * seed batches are flat in `seeds/`, and descending would sweep in `seeds/candidates/`,
 * which holds Wikidata discovery output in a completely different shape.
 */
function expandGlob(pattern: string): string[] {
  const dir = dirname(pattern);
  const base = basename(pattern);
  if (base.includes("/") || dir.includes("*")) {
    fail(`Only a single-directory glob is supported (e.g. seeds/01*.json): ${pattern}`);
  }

  const regex = new RegExp(
    `^${base.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`,
  );

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    fail(`No such directory: ${dir}`);
  }
  return entries.filter((entry) => regex.test(entry)).map((entry) => join(dir, entry));
}

type Loaded = { file: string; records: unknown[] };

function loadRecords(files: string[]): Loaded[] {
  return files.map((file) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (cause) {
      fail(`${file}: not valid JSON — ${cause instanceof Error ? cause.message : cause}`);
    }
    const envelope = ImportEnvelope.safeParse(parsed);
    if (!envelope.success) {
      fail(`${file}: ${envelope.error.issues[0]?.message ?? "invalid payload"}`);
    }
    return { file, records: envelope.data };
  });
}

/**
 * Validation without a database.
 *
 * Errors come out in the exact `ImportReport["errors"]` shape so a `--dry` run and a real
 * run are diffable — the whole point of a dry run is that its output predicts the real one.
 */
function dryRun(records: unknown[]): ImportReport["errors"] {
  const errors: ImportReport["errors"] = [];
  for (const [index, raw] of records.entries()) {
    const parsed = ProductionInput.safeParse(raw);
    if (parsed.success) continue;
    const name =
      typeof raw === "object" && raw !== null && "name" in raw && typeof raw.name === "string"
        ? raw.name
        : null;
    errors.push({
      index,
      name,
      message: parsed.error.issues
        .map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join("; "),
    });
  }
  return errors;
}

function printReport(report: ImportReport, label: string, seconds: number): void {
  const perRecord = report.received > 0 ? (seconds / report.received).toFixed(2) : "0.00";
  console.log(`\n${label} — ${report.received} records in ${seconds.toFixed(1)}s (${perRecord}s/record)`);

  for (const [table, counts] of Object.entries(report.summary)) {
    const parts = [`${counts.created} created`, `${counts.updated} updated`];
    // `unchanged` is what a clean re-run looks like; it only exists once the bulk prefetch
    // can tell "already correct" from "written again with the same values".
    if ("unchanged" in counts) parts.push(`${(counts as { unchanged: number }).unchanged} unchanged`);
    console.log(`  ${table.padEnd(12)} ${parts.join(" / ")}`);
  }

  const created = Object.entries(report.createdLookups).filter(([, v]) => v.length > 0);
  if (created.length > 0) {
    console.log("\n  New lookup rows — check these for name variants:");
    for (const [kind, names] of created) {
      console.log(`    ${kind}: ${names.join(", ")}`);
    }
  }

  const confidence = Object.entries(report.confidence).filter(([, count]) => count > 0);
  if (confidence.length > 0) {
    console.log(`\n  Confidence: ${confidence.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  }

  if (report.errors.length > 0) {
    console.log(`\n  ${report.errors.length} error(s):`);
    for (const e of report.errors) {
      console.log(`    [${e.index}] ${e.name ?? "?"}: ${e.message}`);
    }
  }
}

/**
 * What a second run of the same batch must look like.
 *
 * `updated` is deliberately not asserted. `resolveSource` writes its patch every time and
 * `writeCitations` always refreshes `retrieved_on`, so sources and citations report updates
 * on a clean re-run by design. What must be zero is creation: a second run that creates
 * anything means a write key is not stable, which is the bug this check exists to find.
 */
function idempotencyViolations(first: ImportReport, second: ImportReport): string[] {
  const violations: string[] = [];

  for (const [table, counts] of Object.entries(second.summary)) {
    if (counts.created > 0) {
      violations.push(`${table}: created ${counts.created} row(s) on the second run — expected 0`);
    }
  }

  for (const [kind, names] of Object.entries(second.createdLookups)) {
    if (names.length > 0) {
      violations.push(`createdLookups.${kind} not empty on the second run: ${names.join(", ")}`);
    }
  }

  if (second.errors.length > 0) {
    violations.push(`${second.errors.length} error(s) on the second run`);
  }

  // Free bonus: proves the citations landed identically, not just that no row was created.
  for (const level of Object.keys(first.confidence) as (keyof ImportReport["confidence"])[]) {
    if (first.confidence[level] !== second.confidence[level]) {
      violations.push(
        `confidence.${level} changed between runs: ${first.confidence[level]} → ${second.confidence[level]}`,
      );
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const files = resolveInputs(args.inputs);
  const loaded = loadRecords(files);

  let records = loaded.flatMap((l) => l.records);
  if (args.limit !== null) records = records.slice(0, args.limit);

  console.log(
    `${files.length} file(s), ${records.length} record(s):\n` +
      loaded.map((l) => `  ${l.file} (${l.records.length})`).join("\n"),
  );

  if (args.dry) {
    const errors = dryRun(records);
    if (args.json) {
      console.log(JSON.stringify({ ok: errors.length === 0, received: records.length, errors }, null, 2));
    } else if (errors.length === 0) {
      console.log(`\nDry run: all ${records.length} records validate. Nothing was written.`);
    } else {
      console.log(`\nDry run: ${errors.length} record(s) failed validation.`);
      for (const e of errors) console.log(`  [${e.index}] ${e.name ?? "?"}: ${e.message}`);
    }
    process.exit(errors.length === 0 ? 0 : 1);
  }

  const db = createServiceClient();

  const startedAt = process.hrtime.bigint();
  const first = await runImport(db, records);
  const firstSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

  if (args.json) {
    console.log(JSON.stringify(first, null, 2));
  } else {
    printReport(first, "Import", firstSeconds);
  }

  if (!args.verify) {
    process.exit(first.ok ? 0 : 1);
  }

  console.log("\nVerifying idempotency — re-importing the same records…");
  const verifyStartedAt = process.hrtime.bigint();
  const second = await runImport(db, records);
  const secondSeconds = Number(process.hrtime.bigint() - verifyStartedAt) / 1e9;
  if (!args.json) printReport(second, "Re-import", secondSeconds);

  const violations = idempotencyViolations(first, second);
  if (violations.length > 0) {
    console.log(`\nIdempotency FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.log(`  ${v}`);
    process.exit(1);
  }

  console.log("\nIdempotency OK — the second run created nothing and derived the same confidence.");
  process.exit(first.ok ? 0 : 1);
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack ?? cause.message : String(cause));
  process.exit(1);
});
