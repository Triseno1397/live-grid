import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntityProductions } from "@/components/entity-productions";
import { PageHeader, PageShell } from "@/components/page-shell";
import { StatBlock } from "@/components/ui/stat-block";
import { todayISO } from "@/lib/format";
import { getEntitySlugs, getNetwork, productionsOnNetwork } from "@/lib/queries/entities";
import { allEntries, sortForDisplay } from "@/lib/queries/productions";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getEntitySlugs("networks")).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const network = await getNetwork((await params).slug);
  return { title: network?.name ?? "Not found" };
}

export default async function NetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [network, productions] = await Promise.all([getNetwork(slug), productionsOnNetwork(slug)]);
  if (!network) notFound();

  const today = todayISO();
  const entries = sortForDisplay(allEntries(productions, today));
  const editions = productions.flatMap((p) => p.editions);

  return (
    <PageShell>
      <PageHeader
        eyebrow={network.isStreaming ? "Streaming" : "Broadcast network"}
        title={network.name}
        lede={
          network.website ? (
            <a
              href={network.website}
              rel="noreferrer noopener"
              target="_blank"
              className="text-fg-secondary underline-offset-2 hover:text-fg hover:underline"
            >
              {new URL(network.website).hostname}
            </a>
          ) : undefined
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-x-6 border-y border-line-subtle py-4">
        <StatBlock label="Productions" value={productions.length} />
        <StatBlock label="Editions" value={editions.length} />
      </div>

      <section className="mt-6">
        <h2 className="eyebrow mb-3 text-fg-tertiary">Slate</h2>
        <EntityProductions
          entries={entries}
          emptyMessage="No productions are recorded on this network."
        />
      </section>
    </PageShell>
  );
}
