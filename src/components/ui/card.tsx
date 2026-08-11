import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * `#121212` on `#0a0a0a` with a 1px border and **no shadow at rest** (DESIGN.md).
 *
 * Depth comes from the border first. A resting shadow on every card is what makes a dark
 * UI read as stacked grey boxes instead of one plane, and it costs the lift its meaning:
 * only something that responds to the pointer should rise.
 */
export function Card({
  interactive = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line-subtle bg-card",
        interactive && [
          "[transition:var(--transition-control),box-shadow_var(--duration-fast)_var(--ease-standard)]",
          "hover:-translate-y-px hover:border-line-strong hover:shadow-md",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Section heading inside a card or panel: uppercase eyebrow over a hairline. */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-(--head-h) items-center justify-between gap-3 border-b border-line-subtle px-3",
        className,
      )}
    >
      <h2 className="eyebrow text-fg-tertiary">{title}</h2>
      {action}
    </div>
  );
}
