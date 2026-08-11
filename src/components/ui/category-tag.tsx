import { cn } from "@/lib/cn";
import { categoryLabel } from "@/lib/format";
import type { Category } from "@/lib/queries/types";

/**
 * Always neutral, never coloured (DESIGN.md).
 *
 * Twelve categories would need twelve hues, and next to a status badge the eye would read
 * the louder one as the meaningful one. Status owns colour in a card; category owns shape
 * and position.
 */
export function CategoryTag({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex h-[22px] items-center rounded-sm bg-active px-1.5",
        "font-mono text-fg-secondary",
        className,
      )}
    >
      {categoryLabel(category)}
    </span>
  );
}
