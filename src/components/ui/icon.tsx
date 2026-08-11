import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Lucide only, stroke-width 1.75, always `currentColor` (DESIGN.md, locked).
 *
 * Wrapping the glyph rather than importing Lucide directly at call sites is what keeps
 * that true: a stray `fill` or a second icon set has one place to not happen.
 */
export type IconSize = "dense" | "default" | "nav";

const SIZE_PX: Record<IconSize, number> = {
  dense: 14, // inside table rows and badges
  default: 16,
  nav: 20,
};

export function Icon({
  icon: Glyph,
  size = "default",
  className,
  label,
}: {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
  /** Set only when the icon is the sole content of a control and carries its meaning. */
  label?: string;
}) {
  const px = SIZE_PX[size];
  return (
    <Glyph
      width={px}
      height={px}
      strokeWidth={1.75}
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
