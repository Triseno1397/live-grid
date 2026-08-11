import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatDateProse, MIDDOT } from "@/lib/format";
import type { ProductionEntry } from "@/lib/queries/types";

import { Card } from "./card";
import { CategoryTag } from "./category-tag";
import { Countdown } from "./countdown";
import { ScaleStars } from "./scale-stars";
import { StatusBadge } from "./status-badge";

/**
 * The dashboard's unit. Two columns, and the countdown never sits inline with the
 * metadata (DESIGN.md) — it holds its own right-hand column so a scanning eye reads a
 * single vertical strip of numbers down the page instead of hunting for each one.
 *
 * The metadata line omits null city and network rather than printing an em dash for each:
 * the line is a summary, and three dashes in a row is noise. The fact table on the
 * production page is where every nullable field is accounted for explicitly.
 */
export function ProductionCard({
  entry,
  className,
}: {
  entry: ProductionEntry;
  className?: string;
}) {
  const { production, edition, daysOut } = entry;
  const network = edition?.network ?? production.network;

  const meta = [
    formatDateProse(edition?.startDate),
    edition?.city ? [edition.city.name, edition.city.state].filter(Boolean).join(", ") : null,
    network?.name,
  ].filter(Boolean);

  return (
    <Link href={`/p/${production.slug}`} className="block rounded-lg">
      <Card interactive className={cn("flex items-start gap-3 p-3", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryTag category={production.category} />
            {edition && <StatusBadge status={edition.status} />}
          </div>

          <h3 className="truncate text-lg font-semibold tracking-[-0.015em] text-fg">
            {production.name}
          </h3>

          <p className="numeric truncate text-sm text-fg-secondary">
            {meta.join(` ${MIDDOT} `)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Countdown days={daysOut} size="md" />
          <ScaleStars scale={production.scale} className="text-sm" />
        </div>
      </Card>
    </Link>
  );
}
