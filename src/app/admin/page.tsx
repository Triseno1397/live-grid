import Link from "next/link";

import { getSeedStats, type SeedStats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Phase 0 seeding status. Internal tooling, not the public product — the Phase 1
 * dashboard is a different page with a different job (upcoming shows, countdown timers).
 * This one answers "how much of the moat is dug, and did anything land wrong."
 *
 * Reads through getSeedStats, the same function GET /api/admin/stats serves, so the page
 * and the endpoint cannot drift.
 */
export default async function AdminPage() {
  let stats: SeedStats | null = null;
  let error: string | null = null;
  try {
    stats = await getSeedStats(await createClient());
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Failed to load stats.";
  }

  if (error || !stats) {
    return (
      <main className="mx-auto max-w-5xl p-6 font-mono text-sm">
        <h1 className="text-lg font-semibold">Live Grid — seeding status</h1>
        <p className="mt-4 rounded border border-red-900 bg-red-950/40 p-3 text-red-300">{error}</p>
      </main>
    );
  }

  const { counts, targets, byCategory, byStatus, productions, orphanLookups } = stats;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6 font-mono text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Live Grid — seeding status</h1>
        <Link href="/admin/import" className="text-neutral-400 underline hover:text-neutral-100">
          → import
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-neutral-400">Phase 0 targets</h2>
        <Progress label="productions" value={counts.productions} target={targets.productions} />
        <Progress label="editions" value={counts.editions} target={targets.editions} />
        <Progress label="viewership" value={counts.viewership} target={targets.viewership} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-neutral-400">Lookup tables</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Stat label="cities" value={counts.cities} />
          <Stat label="networks" value={counts.networks} />
          <Stat label="companies" value={counts.companies} />
          <Stat label="venues" value={counts.venues} />
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h2 className="mb-1 text-neutral-400">By category</h2>
          {byCategory.map(({ category, count }) => (
            <div key={category} className="flex justify-between gap-4">
              <span className={count === 0 ? "text-neutral-600" : ""}>{category}</span>
              <span className={count === 0 ? "text-neutral-600" : "tabular-nums"}>{count}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="mb-1 text-neutral-400">Editions by status</h2>
          {byStatus.map(({ status, count }) => (
            <div key={status} className="flex justify-between gap-4">
              <span className={count === 0 ? "text-neutral-600" : ""}>{status}</span>
              <span className={count === 0 ? "text-neutral-600" : "tabular-nums"}>{count}</span>
            </div>
          ))}
        </div>
      </section>

      {orphanLookups.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-amber-400">
            Unreferenced lookups ({orphanLookups.length}) — likely name variants
          </h2>
          <div className="rounded border border-amber-900 bg-amber-950/30 p-3">
            {orphanLookups.map((o) => (
              <div key={`${o.kind}:${o.slug}`}>
                {o.kind}: {o.name}{" "}
                <span className="text-neutral-500">({o.slug})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-neutral-400">Productions ({productions.length})</h2>
        {productions.length === 0 && <p className="text-neutral-500">Nothing seeded yet.</p>}
        <div className="flex flex-col divide-y divide-neutral-800">
          {productions.map((p) => (
            <div key={p.slug} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-semibold">{p.name}</span>
                <span className="text-neutral-500">{p.category}</span>
                <span className="text-neutral-500">
                  {p.scale ? "★".repeat(p.scale) : "—"}
                </span>
              </div>
              <div className="text-neutral-500">
                {p.network ?? "no network"} · {p.company ?? "no company"} ·{" "}
                {p.viewershipYears.length
                  ? `viewership ${p.viewershipYears.join(", ")}`
                  : "no viewership"}
              </div>
              {p.editions.map((e) => (
                <div key={e.year} className="text-neutral-400">
                  {e.year} · <StatusBadge status={e.status} /> · {e.startDate ?? "no date"} ·{" "}
                  {e.city ?? "no city"}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-neutral-500">{label}</span>{" "}
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-400">
          {value} / {target} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-neutral-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // rumored is a feature, not a data-quality failure — style it distinctly (AGENTS.md).
  const tone =
    status === "confirmed"
      ? "text-emerald-400"
      : status === "rumored"
        ? "text-amber-400"
        : status === "announced"
          ? "text-sky-400"
          : status === "cancelled"
            ? "text-red-400"
            : "text-neutral-500";
  return <span className={tone}>{status}</span>;
}
