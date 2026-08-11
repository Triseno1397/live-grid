import { cn } from "@/lib/cn";

/**
 * Toggle for a setting that takes effect immediately — the include-rumored filter is the
 * only one in Phase 1. Not for form submission; that is what Checkbox is for.
 *
 * The knob moves on `transform` alone (DESIGN.md: transform and opacity only), so
 * `prefers-reduced-motion` zeroing the duration leaves it correct rather than broken.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-8 cursor-pointer items-center justify-between gap-3 text-base",
        "text-fg-secondary hover:text-fg max-sm:min-h-(--tap-min)",
        className,
      )}
    >
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5",
          "[transition:var(--transition-control)]",
          checked ? "border-accent bg-accent" : "border-line bg-raised",
        )}
      >
        <span
          className={cn(
            "block size-3.5 rounded-full [transition:var(--transition-control)]",
            checked ? "translate-x-4 bg-white" : "translate-x-0 bg-fg-tertiary",
          )}
        />
      </button>
    </label>
  );
}
