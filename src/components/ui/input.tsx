import type { InputHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";

/**
 * 32px by default, matching `--control-h-md` so an input and a button sit on the same line
 * without either being nudged. On mobile the tap floor takes over.
 */
export function Input({
  leadingIcon,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { leadingIcon?: LucideIcon }) {
  const field = (
    <input
      className={cn(
        "h-(--control-h-md) w-full rounded-md border border-line bg-raised px-2.5 text-base",
        "text-fg placeholder:text-fg-tertiary",
        "hover:border-line-strong focus:border-line-strong",
        "[transition:var(--transition-control)]",
        "max-sm:h-(--tap-min)",
        leadingIcon && "pl-8",
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon) return field;

  return (
    <div className="relative w-full">
      <Icon
        icon={leadingIcon}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-tertiary"
      />
      {field}
    </div>
  );
}
