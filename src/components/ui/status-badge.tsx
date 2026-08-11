import { cn } from "@/lib/cn";
import type { EditionStatus } from "@/lib/queries/types";

/**
 * The five edition statuses, and the only place besides the countdown where colour carries
 * meaning.
 *
 * `rumored` gets a dashed border — the one shape change in the whole system. It is the
 * status the audience cares most about (a tracked rumor is a feature, not a data-quality
 * failure, per AGENTS.md), so it has to survive being scanned past at speed, and a hue
 * shift alone does not do that for a red-green colourblind reader.
 *
 * `cancelled` is struck through for the same reason: it is the one status that means the
 * row is no longer information about a show that will happen.
 */
const STATUS_STYLES: Record<EditionStatus, string> = {
  confirmed: "text-confirmed bg-confirmed-bg border-confirmed",
  announced: "text-announced bg-announced-bg border-announced",
  rumored: "text-rumored bg-rumored-bg border-rumored border-dashed",
  completed: "text-completed bg-completed-bg border-completed",
  cancelled: "text-cancelled bg-cancelled-bg border-cancelled line-through",
};

export function StatusBadge({
  status,
  className,
}: {
  status: EditionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "eyebrow inline-flex h-[22px] items-center gap-1.5 rounded-sm border px-1.5",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-current" />
      {status}
    </span>
  );
}
