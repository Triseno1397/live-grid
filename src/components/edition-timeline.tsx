import { cn } from "@/lib/cn";
import { formatDateProse } from "@/lib/format";
import type { EditionTimeline } from "@/lib/queries/types";

/**
 * Load-in through strike, in production order.
 *
 * Only populated milestones render. An empty row would say "this stage does not apply";
 * omitting it says "this is not on record yet", which is the true statement. The audience
 * knows what these stages are — no explanation, just the dates (DESIGN.md copy rules).
 */
const STAGES: { key: keyof EditionTimeline; label: string }[] = [
  { key: "loadIn", label: "Load-in" },
  { key: "techRehearsal", label: "Tech" },
  { key: "dressRehearsal", label: "Dress" },
  { key: "showDate", label: "Show" },
  { key: "strike", label: "Strike" },
];

export function hasTimeline(timeline: EditionTimeline): boolean {
  return STAGES.some((stage) => timeline[stage.key] !== null);
}

export function EditionTimelineTrack({
  timeline,
  className,
}: {
  timeline: EditionTimeline;
  className?: string;
}) {
  const populated = STAGES.filter((stage) => timeline[stage.key] !== null);

  if (populated.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-base text-fg-tertiary">
        No production schedule on record.
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {populated.map((stage, index) => (
        <li
          key={stage.key}
          className="flex items-center gap-3 border-b border-line-subtle px-3 py-2.5 last:border-b-0"
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              // The show is the fixed point everything else is scheduled around.
              stage.key === "showDate" ? "bg-accent" : "bg-line-strong",
            )}
          />
          <span className="eyebrow flex-1 text-fg-tertiary">{stage.label}</span>
          <span
            className={cn(
              "numeric text-base tabular-nums",
              stage.key === "showDate" ? "text-fg" : "text-fg-secondary",
            )}
          >
            {formatDateProse(timeline[stage.key])}
          </span>
          <span className="sr-only">{index === populated.length - 1 ? "" : "then"}</span>
        </li>
      ))}
    </ol>
  );
}
