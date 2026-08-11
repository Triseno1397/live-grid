import Link from "next/link";

import { ScaleStars } from "@/components/ui/scale-stars";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSeedStats, type SeedStats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import type { EditionStatus } from "@/lib/queries/types";

export const dynamic = "force-dynamic";

/**
 * Phase 0 seeding status. Internal tooling, not the public product — the Phase 1
 * dashboard is a different page with a different job (upcoming shows, countdown timers).
 * This one answers "how much of the moat is dug, and did anything land wrong."
 *
 * Reads through getSeedStats, the same function GET /api/admin/stats serves, so the page
 * and the endpoint cannot drift.
 *
 * Styling stays minimal but now runs on the design tokens and the shared StatusBadge, so
 * "rumored" means the same thing here as it does on a production page.
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
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 font-mono text-base">
        <h1 className="text-xl font-semibold tracking-[-0.015em]">Live Grid — seeding status</h1>
        <p className="mt-4 rounded-md border border-cancelled bg-cancelled-bg p-3 text-fg">
          {error}
        </p>
      </main>
    );
  }

  const { counts, targets, byCategory, byStatus, productions, orphanLookups } = stats;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-6 font-mono text-base">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-[-0.015em]">Live Grid — seeding status</h1>
        <Link href="/admin/import" className="text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
          → import
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow text-fg-tertiary">Phase 0 targets</h2>
        <Progress label="productions" value={counts.productions} target={targets.productions} />
        <Progress label="editions" value={counts.editions} target={targets.editions} />
        <Progress label="viewership" value={counts.viewership} target={targets.viewership} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="eyebrow text-fg-tertiary">Lookup tables</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Stat label="cities" value={counts.cities} />
          <Stat label="networks" value={counts.networks} />
          <Stat label="companies" value={counts.companies} />
          <Stat label="venues" value={counts.venues} />
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h2 className="eyebrow mb-1 text-fg-tertiary">By category</h2>
          {byCategory.map(({ category, count }) => (
            <div key={category} className="flex justify-between gap-4">
              <span className={count === 0 ? "text-fg-disabled" : "text-fg-secondary"}>
                {category}
              </span>
              <span className={count === 0 ? "text-fg-disabled" : "tabular-nums text-fg"}>
                {count}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="eyebrow mb-1 text-fg-tertiary">Editions by status</h2>
          {byStatus.map(({ status, count }) => (
            <div key={status} className="flex items-center justify-between gap-4">
              <StatusBadge status={status as EditionStatus} />
              <span className={count === 0 ? "text-fg-disabled" : "tabular-nums text-fg"}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </section>

      {orphanLookups.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow text-rumored">
            Unreferenced lookups ({orphanLookups.length}) — likely name variants
          </h2>
          <div className="rounded-md border border-rumored bg-rumored-bg p-3 text-fg-secondary">
            {orphanLookups.map((o) => (
              <div key={`${o.kind}:${o.slug}`}>
                {o.kind}: {o.name} <span className="text-fg-tertiary">({o.slug})</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="eyebrow text-fg-tertiary">Productions ({productions.length})</h2>
        {productions.length === 0 && <p className="text-fg-tertiary">Nothing seeded yet.</p>}
        <div className="flex flex-col divide-y divide-line-subtle">
          {productions.map((p) => (
            <div key={p.slug} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center gap-x-3">
                <Link href={`/p/${p.slug}`} className="font-semibold text-fg hover:text-accent">
                  {p.name}
                </Link>
                <span className="text-fg-tertiary">{p.category}</span>
                <ScaleStars scale={p.scale} />
              </div>
              <div className="text-fg-tertiary">
                {p.network ?? "no network"} · {p.company ?? "no company"} ·{" "}
                {p.viewershipYears.length
                  ? `viewership ${p.viewershipYears.join(", ")}`
                  : "no viewership"}
              </div>
              {p.editions.map((e) => (
                <div key={e.year} className="flex flex-wrap items-center gap-2 text-fg-secondary">
                  <span className="tabular-nums">{e.year}</span>
                  <StatusBadge status={e.status as EditionStatus} />
                  <span className="tabular-nums">{e.startDate ?? "no date"}</span>
                  <span className="text-fg-tertiary">{e.city ?? "no city"}</span>
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
      <span className="text-fg-tertiary">{label}</span>{" "}
      <span className="tabular-nums text-fg">{value}</span>
    </span>
  );
}

function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-fg-secondary">{label}</span>
        <span className="tabular-nums text-fg-tertiary">
          {value} / {target} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-active">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
