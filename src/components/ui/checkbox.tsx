import type { InputHTMLAttributes } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Native checkbox with the platform styling removed and a Lucide check laid over it.
 *
 * The input keeps its own semantics and focus behaviour; only the paint is ours. The whole
 * row is the label, so the tap target is the full width of the filter rail rather than a
 * 16px square.
 */
export function Checkbox({
  label,
  count,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  /** Facet count. Rendered tabular so a column of them lines up. */
  count?: number;
}) {
  return (
    <label
      className={cn(
        "press group flex min-h-8 cursor-pointer items-center gap-2 rounded-sm px-1.5 -mx-1.5",
        "text-base text-fg-secondary hover:bg-hover hover:text-fg",
        "max-sm:min-h-(--tap-min)",
        className,
      )}
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className={cn(
            "peer size-4 appearance-none rounded-xs border border-line bg-raised",
            "checked:border-accent checked:bg-accent",
            "[transition:var(--transition-control)]",
          )}
          {...props}
        />
        <Check
          width={11}
          height={11}
          strokeWidth={3}
          aria-hidden
          className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="numeric text-sm text-fg-tertiary tabular-nums">{count}</span>
      )}
    </label>
  );
}
