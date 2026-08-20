import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/page-shell";
import { todayISO } from "@/lib/format";
import { CATEGORIES } from "@/lib/import/schema";
import { allEntries, getProductions } from "@/lib/queries/productions";
import type { Category } from "@/lib/queries/types";

import { BrowseTable, type BrowseRow } from "./browse-table";

export const metadata: Metadata = { title: "Browse" };

export const revalidate = 300;

export default async function BrowsePage() {
  const today = todayISO();
  const productions = await getProductions();

  const rows: BrowseRow[] = allEntries(productions, today).map(({ production, edition }) => ({
    slug: production.slug,
    name: production.name,
    category: production.category,
    scale: production.scale,
    status: edition?.status ?? null,
    date: edition?.startDate ?? null,
    city: edition?.city ? [edition.city.name, edition.city.state].filter(Boolean).join(", ") : null,
    citySlug: edition?.city?.slug ?? null,
    network: (edition?.network ?? production.network)?.name ?? null,
    // Month filter falls back to typical_month, so a recurring show with no dated edition
    // is still findable by when it normally runs — which is why the column exists.
    month: edition?.startDate ? Number(edition.startDate.slice(5, 7)) : production.typicalMonth,
    confidence: production.confidence,
  }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Every production"
        title="Browse"
        lede="One row per production, showing its next edition or, where none is scheduled, its most recent."
      />
      <BrowseTable rows={rows} categories={CATEGORIES as unknown as Category[]} />
    </PageShell>
  );
}
