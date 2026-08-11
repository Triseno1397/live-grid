import { EmptyState } from "@/components/ui/data-table";
import { ProductionCard } from "@/components/ui/production-card";
import type { ProductionEntry } from "@/lib/queries/types";

/**
 * The production list shared by the city, network and company pages.
 *
 * Those three pages are thin by design (LIVEGRID_PLAN.md) and differ only in their header
 * and side rail — the list itself is the same question with a different filter, so it is
 * the same component and the same card.
 */
export function EntityProductions({
  entries,
  emptyMessage,
}: {
  entries: ProductionEntry[];
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState message={emptyMessage} className="rounded-lg border border-line-subtle bg-card" />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <ProductionCard key={entry.production.slug} entry={entry} />
      ))}
    </div>
  );
}
