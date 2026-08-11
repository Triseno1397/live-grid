import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * A styled native `<select>`.
 *
 * Native is the right call here rather than a custom listbox: it is keyboard- and
 * screen-reader-correct for free, and on a phone it opens the platform picker instead of a
 * cramped in-page menu. The filter rail is the only place this appears, and none of its
 * options need rich content.
 *
 * The chevron is the ⌄ character on a wrapper, per the functional-unicode list in
 * DESIGN.md — `appearance-none` removes the platform arrow along with the platform styling.
 */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "h-(--control-h-md) w-full appearance-none rounded-md border border-line bg-raised",
          "pl-2.5 pr-7 text-base text-fg",
          "hover:border-line-strong focus:border-line-strong",
          "[transition:var(--transition-control)]",
          "max-sm:h-(--tap-min)",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm leading-none text-fg-tertiary"
      >
        ⌄
      </span>
    </div>
  );
}
