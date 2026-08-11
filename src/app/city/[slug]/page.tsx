import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntityProductions } from "@/components/entity-productions";
import { PageHeader, PageShell, Panel } from "@/components/page-shell";
import { EmptyState } from "@/components/ui/data-table";
import { StatBlock } from "@/components/ui/stat-block";
import { monthName, todayISO } from "@/lib/format";
import { getCity, getEntitySlugs, getVenuesInCity, productionsInCity } from "@/lib/queries/entities";
import { allEntries, sortForDisplay } from "@/lib/queries/productions";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getEntitySlugs("cities")).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const city = await getCity((await params).slug);
  return { title: city ? [city.name, city.state].filter(Boolean).join(", ") : "Not found" };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [city, productions, venues] = await Promise.all([
    getCity(slug),
    productionsInCity(slug),
    getVenuesInCity(slug),
  ]);
  if (!city) notFound();

  const today = todayISO();
  const entries = sortForDisplay(allEntries(productions, today));
  const editions = productions.flatMap((p) => p.editions);

  // "Typical busy months" from the editions actually recorded here, not from
  // productions.typical_month — a show's usual month says nothing about this city.
  const monthTally = new Map<number, number>();
  for (const edition of editions) {
    if (!edition.startDate) continue;
    const month = Number(edition.startDate.slice(5, 7));
    monthTally.set(month, (monthTally.get(month) ?? 0) + 1);
  }
  const busyMonths = [...monthTally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 5);

  return (
    <PageShell>
      <PageHeader
        eyebrow="City"
        title={[city.name, city.state].filter(Boolean).join(", ")}
        lede={[city.country, city.timezone].filter(Boolean).join(" · ")}
      />

      <div className="mt-6 grid grid-cols-3 gap-x-6 border-y border-line-subtle py-4">
        <StatBlock label="Productions" value={productions.length} />
        <StatBlock label="Editions" value={editions.length} />
        <StatBlock label="Venues" value={venues.length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <h2 className="eyebrow mb-3 text-fg-tertiary">Productions recorded here</h2>
          <EntityProductions
            entries={entries}
            emptyMessage="No productions are recorded in this city."
          />
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start">
          <Panel title="Venues">
            {venues.length === 0 ? (
              <EmptyState message="No venues are recorded in this city." />
            ) : (
              <ul>
                {venues.map((venue) => (
                  <li
                    key={venue.slug}
                    className="flex items-baseline justify-between gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0"
                  >
                    <span className="truncate text-base text-fg-secondary">{venue.name}</span>
                    {venue.capacity && (
                      <span className="numeric shrink-0 text-sm tabular-nums text-fg-tertiary">
                        {venue.capacity.toLocaleString("en-US")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Busiest months">
            {busyMonths.length === 0 ? (
              <EmptyState message="No dated editions are recorded here." />
            ) : (
              <ul>
                {busyMonths.map(([month, count]) => (
                  <li
                    key={month}
                    className="flex items-baseline justify-between gap-3 border-b border-line-subtle px-3 py-2 last:border-b-0"
                  >
                    <span className="text-base text-fg-secondary">{monthName(month)}</span>
                    <span className="numeric text-sm tabular-nums text-fg-tertiary">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </PageShell>
  );
}
