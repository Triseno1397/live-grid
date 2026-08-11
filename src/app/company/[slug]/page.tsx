import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntityProductions } from "@/components/entity-productions";
import { PageHeader, PageShell } from "@/components/page-shell";
import { StatBlock } from "@/components/ui/stat-block";
import { MIDDOT, todayISO } from "@/lib/format";
import { getCompany, getEntitySlugs, productionsByCompany } from "@/lib/queries/entities";
import { allEntries, sortForDisplay } from "@/lib/queries/productions";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getEntitySlugs("companies")).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const company = await getCompany((await params).slug);
  return { title: company?.name ?? "Not found" };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [company, productions] = await Promise.all([getCompany(slug), productionsByCompany(slug)]);
  if (!company) notFound();

  const today = todayISO();
  const entries = sortForDisplay(allEntries(productions, today));
  const editions = productions.flatMap((p) => p.editions);

  const lede = [
    company.headquarters,
    company.website ? new URL(company.website).hostname : null,
  ].filter(Boolean);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Production company"
        title={company.name}
        lede={lede.length > 0 ? lede.join(` ${MIDDOT} `) : undefined}
      />

      <div className="mt-6 grid grid-cols-2 gap-x-6 border-y border-line-subtle py-4">
        <StatBlock label="Productions" value={productions.length} />
        <StatBlock label="Editions" value={editions.length} />
      </div>

      <section className="mt-6">
        <h2 className="eyebrow mb-3 text-fg-tertiary">Productions</h2>
        <EntityProductions
          entries={entries}
          emptyMessage="No productions are recorded for this company."
        />
      </section>
    </PageShell>
  );
}
