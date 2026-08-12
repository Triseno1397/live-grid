import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EditionTimelineTrack, hasTimeline } from "@/components/edition-timeline";
import { PageShell, Panel } from "@/components/page-shell";
import { ProductionTeam } from "@/components/production-team";
import { ViewershipTrend } from "@/components/viewership-trend";
import { CategoryTag } from "@/components/ui/category-tag";
import { Countdown } from "@/components/ui/countdown";
import { Table, TableScroller, TBody, TD, TH, THead, TR } from "@/components/ui/data-table";
import { FactTable, type Fact } from "@/components/ui/fact-table";
import { ScaleStars } from "@/components/ui/scale-stars";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  categoryLabel,
  formatDateISO,
  formatDateRange,
  MIDDOT,
  monthName,
  todayISO,
} from "@/lib/format";
import { getEntitySlugs } from "@/lib/queries/entities";
import { getProduction, pickEdition, teamForEdition } from "@/lib/queries/productions";
import type { TeamRole } from "@/lib/queries/types";

export const revalidate = 300;

/** Reading order for a condensed team line. Lower sorts first. */
const TEAM_ROLE_ORDER: Record<TeamRole, number> = {
  production_company: 0,
  executive_producer: 1,
  director: 2,
  lighting: 3,
  audio: 4,
  video: 5,
  staging: 6,
};

export async function generateStaticParams() {
  return (await getEntitySlugs("productions")).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const production = await getProduction((await params).slug);
  if (!production) return { title: "Not found" };
  return {
    title: production.name,
    description: production.description ?? undefined,
  };
}

export default async function ProductionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const production = await getProduction(slug);
  if (!production) notFound();

  const today = todayISO();
  const { edition, daysOut, isUpcoming } = pickEdition(production, today);
  const network = edition?.network ?? production.network;

  const facts: Fact[] = [
    {
      label: "Category",
      value: (
        <span>
          {categoryLabel(production.category)}
          {production.subcategory && (
            <span className="text-fg-tertiary"> / {production.subcategory}</span>
          )}
        </span>
      ),
    },
    {
      label: "Network",
      value: network ? (
        <Link href={`/network/${network.slug}`} className="hover:text-accent">
          {network.name}
        </Link>
      ) : null,
    },
    {
      label: "Producer",
      value: production.company ? (
        <Link href={`/company/${production.company.slug}`} className="hover:text-accent">
          {production.company.name}
        </Link>
      ) : null,
    },
    { label: "Venue", value: edition?.venue?.name ?? null },
    {
      label: "City",
      value: edition?.city ? (
        <Link href={`/city/${edition.city.slug}`} className="hover:text-accent">
          {[edition.city.name, edition.city.state].filter(Boolean).join(", ")}
        </Link>
      ) : null,
    },
    {
      label: "Typical month",
      value: production.typicalMonth ? monthName(production.typicalMonth) : null,
    },
    { label: "Scale", value: <ScaleStars scale={production.scale} /> },
    // The schema stores a boolean, not a cadence. "Annual" would assert a frequency the
    // column does not carry - Family Feud is recurring and tapes most weekdays.
    { label: "Recurring", value: production.recurring ? "Recurring" : "One-off" },
    {
      // Labelling a past date "Next edition" is simply wrong, and most editions on record
      // are past ones.
      label: isUpcoming ? "Next edition" : "Latest edition",
      value: edition ? (
        <span className="numeric">{formatDateRange(edition.startDate, edition.endDate)}</span>
      ) : null,
    },
  ];

  /**
   * The schedule panel follows the edition that matters, falling back to the most recent
   * edition that has one. `editions` is ascending by year, so a plain `.find` returned the
   * OLDEST schedule on record — a 2026 upfront page showing its 2024 call times.
   */
  const timelineEdition =
    edition && hasTimeline(edition.timeline)
      ? edition
      : ([...production.editions].reverse().find((e) => hasTimeline(e.timeline)) ?? edition);

  const currentTeam = teamForEdition(production.team, edition?.id ?? null);

  /**
   * One line per other year on record: who ran it, condensed. Production-level entries are
   * excluded here — they apply to every year, so repeating them down the list would say
   * nothing about how a given year differed.
   */
  const priorYears = [...production.editions]
    .reverse()
    .filter((e) => e.id !== edition?.id)
    .map((e) => {
      const names = production.team
        .filter((m) => m.editionId === e.id)
        // Company, then producers, then director — reading order, not storage order.
        // Sorting on sortOrder alone put the director (0) ahead of the first EP (1).
        .sort((a, b) => TEAM_ROLE_ORDER[a.role] - TEAM_ROLE_ORDER[b.role] || a.sortOrder - b.sortOrder)
        .map((m) => m.company?.name ?? m.personName)
        .filter((name): name is string => Boolean(name));
      return { year: e.year, summary: [...new Set(names)].join(` ${MIDDOT} `) };
    })
    .filter((row) => row.summary !== "");

  return (
    <PageShell className="pt-0">
      <Hero
        name={production.name}
        category={production.category}
        description={production.description}
        heroImageUrl={production.heroImageUrl}
        status={edition?.status ?? null}
        daysOut={daysOut}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start">
          <Panel title="Facts">
            <FactTable facts={facts} className="px-3 py-1" />
          </Panel>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title={edition ? `Production team — ${edition.year}` : "Production team"}
          >
            <ProductionTeam team={currentTeam} edition={edition} priorYears={priorYears} />
          </Panel>

          <Panel title="Average viewers">
            <ViewershipTrend points={production.viewership} />
          </Panel>

          <Panel
            title="Edition history"
            action={
              <span className="numeric text-sm text-fg-tertiary">{production.editions.length}</span>
            }
          >
            <TableScroller>
              <Table>
                <THead sticky={false}>
                  <tr>
                    <TH>Year</TH>
                    <TH>Date</TH>
                    <TH>City</TH>
                    <TH>Venue</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {[...production.editions].reverse().map((e) => (
                    <TR key={e.id} dense>
                      <TD numeric className="text-left text-fg">
                        {e.year}
                      </TD>
                      <TD className="numeric whitespace-nowrap">{formatDateISO(e.startDate)}</TD>
                      <TD>{e.city?.name ?? <span className="text-fg-disabled">—</span>}</TD>
                      <TD>{e.venue?.name ?? <span className="text-fg-disabled">—</span>}</TD>
                      <TD>
                        <StatusBadge status={e.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroller>
          </Panel>

          <Panel
            title={
              timelineEdition ? `Schedule — ${timelineEdition.year}` : "Schedule"
            }
          >
            {timelineEdition ? (
              <EditionTimelineTrack timeline={timelineEdition.timeline} />
            ) : (
              <p className="px-3 py-8 text-center text-base text-fg-tertiary">
                No production schedule on record.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Type-only by default. Every hero_image_url in the database is currently null, so the
 * imageless hero is the real path, not a fallback — and where there is no image the space
 * is left empty rather than filled with a placeholder (DESIGN.md).
 */
function Hero({
  name,
  category,
  description,
  heroImageUrl,
  status,
  daysOut,
}: {
  name: string;
  category: Parameters<typeof CategoryTag>[0]["category"];
  description: string | null;
  heroImageUrl: string | null;
  status: Parameters<typeof StatusBadge>[0]["status"] | null;
  daysOut: number | null;
}) {
  return (
    <section className="relative -mx-4 border-b border-line-subtle px-4 pb-6 pt-6">
      {heroImageUrl && (
        <>
          <Image
            src={heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover"
          />
          {/* The only gradient in the system: a protection scrim so type stays legible. */}
          <div aria-hidden className="protect-bottom absolute inset-0 -z-10" />
        </>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryTag category={category} />
            {status && <StatusBadge status={status} />}
          </div>

          <h1 className="mt-2.5 text-4xl font-semibold tracking-[-0.03em] text-fg">{name}</h1>

          {description && (
            <p className="mt-2 max-w-[62ch] text-md leading-normal text-fg-secondary">
              {description}
            </p>
          )}
        </div>

        <Countdown days={daysOut} size="lg" className="shrink-0" />
      </div>
    </section>
  );
}
