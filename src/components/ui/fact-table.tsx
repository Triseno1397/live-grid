import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { EM_DASH } from "@/lib/format";

export type Fact = {
  label: string;
  /** Null renders an em dash. Never substitute a plausible value to fill the row. */
  value: ReactNode | null;
};

/**
 * Definition list with a fixed 132px label column.
 *
 * Nullable fields render an em dash in the disabled neutral rather than being dropped.
 * Omitting the row would say "this field does not apply"; the dash says "this is not
 * known yet", which is the true statement and the one the audience is here for.
 */
export function FactTable({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <dl className={cn("flex flex-col", className)}>
      {facts.map((fact) => (
        <div
          key={fact.label}
          className={cn(
            "flex items-baseline gap-3 border-b border-line-subtle py-2 last:border-b-0",
            "max-sm:flex-col max-sm:gap-0.5",
          )}
        >
          <dt className="eyebrow w-[132px] shrink-0 pt-0.5 text-fg-tertiary">{fact.label}</dt>
          <dd className={cn("min-w-0 flex-1 text-base", fact.value === null && "text-fg-disabled")}>
            {fact.value ?? EM_DASH}
          </dd>
        </div>
      ))}
    </dl>
  );
}
