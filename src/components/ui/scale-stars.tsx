import { cn } from "@/lib/cn";
import { EM_DASH } from "@/lib/format";

/**
 * `production_scale` 1–5 as ★ (DESIGN.md: scale as stars, never a number).
 *
 * A missing scale renders an em dash, not five empty stars. Zero filled stars would read
 * as "scale 0" — a fact the database does not contain — and the schema has no such value.
 */
export function ScaleStars({
  scale,
  className,
}: {
  scale: number | null;
  className?: string;
}) {
  if (scale === null) {
    return <span className={cn("text-fg-disabled", className)}>{EM_DASH}</span>;
  }

  return (
    <span
      className={cn("inline-flex leading-none tracking-[0.06em]", className)}
      role="img"
      aria-label={`Production scale ${scale} of 5`}
    >
      <span aria-hidden className="text-fg">
        {"★".repeat(scale)}
      </span>
      <span aria-hidden className="[color:var(--n-800)]">
        {"★".repeat(5 - scale)}
      </span>
    </span>
  );
}
