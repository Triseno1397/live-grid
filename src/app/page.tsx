import Link from "next/link";

import { PageHeader, PageShell, Panel } from "@/components/page-shell";
import { EmptyState } from "@/components/ui/data-table";
import { ProductionCard } from "@/components/ui/production-card";
import { StatBlock } from "@/components/ui/stat-block";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateProse, MIDDOT, todayISO } from "@/lib/format";
import {
  busiestCities,
  getProductions,
  rumoredWatchlist,
  summarize,
  upcomingEntries,
} from "@/lib/queries/productions";

/**
 * The page that answers the phone call. Upcoming productions by next edition date, with
 * the countdown as the thing the eye lands on.
 *
 * Five minutes is the right staleness window: editions move by the day, not the second,
 * and the countdown is rendered at day granularity.
 */
export const revalidate = 300;

export default async function DashboardPage() {
  const today = todayISO();
  const productions = await getProductions();

  const upcoming = upcomingEntries(productions, today);
  const stats = summarize(productions, today);
  const cities = busiestCities(productions, today);
  const rumored = rumoredWatchlist(productions);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Live broadcast production"
        title="Upcoming"
        lede={
          <>
            Scheduled editions, soonest first. Dates and venues as recorded{" "}
            <span className="numeric">{today}</span>.
          </>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line-subtle py-4 sm:grid-cols-4">
        <StatBlock label="Productions" value={stats.productions} />
        <StatBlock label="Editions" value={stats.editions} />
        <StatBlock label="Cities" value={stats.cities} />
        <StatBlock label="Rumored" value={stats.rumored} hint="unverified editions" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <h2 className="eyebrow mb-3 text-fg-tertiary">
            Next {upcoming.length === 1 ? "edition" : `${upcoming.length} editions`}
          </h2>

          {upcoming.length === 0 ? (
            <EmptyState
              message="No editions are scheduled ahead of today."
              className="rounded-lg border border-line-subtle bg-card"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((entry) => (
                <ProductionCard key={entry.production.slug} entry={entry} />
              ))}
            </div>
          )}
        </section>

        {/* Sticky below the nav so the rail stays with a long card list. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start">
          <Panel title="Busiest cities">
            {cities.length === 0 ? (
              <EmptyState message="No upcoming editions carry a city." />
            ) : (
              <ul>
                {cities.map(({ city, count }) => (
                  <li key={city.slug}>
                    <Link
                      href={`/city/${city.slug}`}
                      className="flex h-9 items-center justify-between gap-3 border-b border-line-subtle px-3 text-base text-fg-secondary last:border-b-0 hover:bg-hover hover:text-fg"
                    >
                      <span className="truncate">
                        {city.name}
                        {city.state && <span className="text-fg-tertiary"> {city.state}</span>}
                      </span>
                      <span className="numeric tabular-nums text-fg-tertiary">{count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Rumored watchlist">
            {rumored.length === 0 ? (
              <EmptyState message="Nothing is currently tracked as rumored." />
            ) : (
              <ul>
                {rumored.map((event) => (
                  <li key={event.editionId}>
                    <Link
                      href={`/p/${event.productionSlug}`}
                      className="flex flex-col gap-1 border-b border-line-subtle px-3 py-2.5 last:border-b-0 hover:bg-hover"
                    >
                      <span className="truncate text-base text-fg">{event.productionName}</span>
                      <span className="numeric truncate text-sm text-fg-tertiary">
                        {[formatDateProse(event.date || null), event.city?.name]
                          .filter(Boolean)
                          .join(` ${MIDDOT} `)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Status key"
            action={
              <Link href="/browse" className="text-sm text-fg-tertiary hover:text-fg">
                Browse all
              </Link>
            }
          >
            <div className="flex flex-wrap gap-1.5 p-3">
              <StatusBadge status="confirmed" />
              <StatusBadge status="announced" />
              <StatusBadge status="rumored" />
              <StatusBadge status="completed" />
              <StatusBadge status="cancelled" />
            </div>
          </Panel>
        </aside>
      </div>
    </PageShell>
  );
}
