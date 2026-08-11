import { cn } from "@/lib/cn";
import { countdownCaption, EM_DASH } from "@/lib/format";

/**
 * The signature element (AGENTS.md). Broadcast people live on countdowns.
 *
 * Urgency is carried by colour: red inside a week, amber inside a month, plain foreground
 * beyond that. Past editions drop to tertiary and read "days ago" rather than going
 * negative — a "-84" in a card is a glitch, "84 days ago" is a fact.
 *
 * `days` is computed on the server (see pickEdition) and passed in already resolved. The
 * component does no date maths, so it cannot disagree with the row it sits next to and
 * cannot produce a hydration mismatch by reading a different clock than the render did.
 */
const SIZES = {
  sm: { value: "text-lg", caption: "text-2xs" },
  md: { value: "text-3xl", caption: "text-xs" },
  lg: { value: "text-5xl", caption: "text-xs" },
} as const;

function urgencyClass(days: number): string {
  if (days < 0) return "[color:var(--text-tertiary)]";
  if (days <= 7) return "[color:var(--countdown-imminent)]";
  if (days <= 30) return "[color:var(--countdown-near)]";
  return "[color:var(--countdown-far)]";
}

export function Countdown({
  days,
  size = "md",
  className,
}: {
  /** Whole days from today. Negative is past. Null when the edition has no date. */
  days: number | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const scale = SIZES[size];

  if (days === null) {
    return (
      <div className={cn("flex flex-col items-end", className)}>
        <span className={cn("numeric font-semibold leading-none text-fg-disabled", scale.value)}>
          {EM_DASH}
        </span>
        <span className={cn("eyebrow mt-1.5 text-fg-tertiary", scale.caption)}>unconfirmed</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-end", className)}>
      <span
        className={cn(
          "numeric font-semibold leading-none tabular-nums",
          scale.value,
          urgencyClass(days),
        )}
      >
        {Math.abs(days)}
      </span>
      <span className={cn("eyebrow mt-1.5 text-fg-tertiary", scale.caption)}>
        {countdownCaption(days)}
      </span>
    </div>
  );
}
