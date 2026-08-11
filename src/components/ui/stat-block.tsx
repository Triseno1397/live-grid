import { cn } from "@/lib/cn";

/**
 * One figure in the summary rail. Label above, number below, both left-aligned so a row of
 * them forms a readable baseline grid.
 *
 * Values arrive pre-counted from the database. Nothing here rounds up or estimates — a
 * rail that says 34 when the table holds 34 is the whole point of the product.
 */
export function StatBlock({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  /** Optional qualifier, e.g. "of 250 target". */
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="eyebrow text-fg-tertiary">{label}</span>
      <span className="numeric text-3xl font-semibold leading-none tabular-nums text-fg">
        {value}
      </span>
      {hint && <span className="text-sm text-fg-tertiary">{hint}</span>}
    </div>
  );
}
