import { cn } from "@/lib/cn";

/**
 * Segmented control. The active tab gets a filled surface, never an underline
 * (DESIGN.md) — the same rule the nav follows, so "where am I" reads identically in both.
 *
 * Roving `tabIndex` plus arrow keys is the tablist contract; without it a keyboard user
 * tabs through every option to leave the group.
 */
export function Tabs<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (next: T) => void;
  options: { value: T; label: string }[];
  /** Accessible name for the group, e.g. "Calendar view". */
  label: string;
  className?: string;
}) {
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    onValueChange(next.value);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line bg-card p-0.5",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "press h-7 rounded-sm px-3 text-base font-medium tracking-[-0.015em]",
              "max-sm:h-9",
              active ? "bg-active text-fg" : "text-fg-tertiary hover:bg-hover hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
