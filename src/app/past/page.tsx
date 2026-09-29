import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/page-shell";
import { EmptyState } from "@/components/ui/data-table";
import { ProductionCard } from "@/components/ui/production-card";
import { monthName, todayISO } from "@/lib/format";
import { getProductions, pastEntries } from "@/lib/queries/productions";
import type { ProductionEntry } from "@/lib/queries/types";

export const metadata: Metadata = { title: "Past" };

/** Same staleness window as the dashboard: an edition moves here the day after it ends. */
export const revalidate = 300;

/** "2026-08" -> "August 2026". Grouping key and heading in one. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthHeading(key: string): string {
  return `${monthName(Number(key.slice(5, 7)))} ${key.slice(0, 4)}`;
}

/**
 * The archive. Every edition whose last day is behind today, most recent first, grouped by
 * month so a long history stays scannable. The dashboard shows only what is ahead; this is
 * where everything else goes.
 *
 * Status is shown as stored: a rumor that reached its date without confirmation keeps its
 * rumored badge here, because calling it completed would be a fact nobody sourced.
 */
export default async function PastPage() {
  const today = todayISO();
  const entries = pastEntries(await getProductions(), today);

  const groups = new Map<string, ProductionEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.edition!.startDate!);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Archive"
        title="Past"
        lede={
          <>
            Completed and past editions, most recent first.{" "}
            <span className="numeric tabular-nums">{entries.length}</span> on record.
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          message="No editions have finished yet."
          className="mt-6 rounded-lg border border-line-subtle bg-card"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {[...groups].map(([key, group]) => (
            <section key={key}>
              <h2 className="eyebrow mb-3 flex items-baseline justify-between text-fg-tertiary">
                <span>{monthHeading(key)}</span>
                <span className="numeric tabular-nums">{group.length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {group.map((entry) => (
                  <ProductionCard
                    key={entry.edition!.id}
                    entry={entry}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
