import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { Icon } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * At most one primary button per view (DESIGN.md) — `secondary` is the default for a
 * reason. Press is `scale(0.98)` and never a colour jump, which is why no variant below
 * defines an `active:` colour.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-raised text-fg border border-line hover:bg-active hover:border-line-strong",
  ghost: "text-fg-secondary hover:bg-hover hover:text-fg",
  outline: "text-fg border border-line hover:bg-hover hover:border-line-strong",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-(--control-h-sm) px-2.5 text-xs gap-1.5",
  md: "h-(--control-h-md) px-3 text-base gap-2",
  lg: "h-(--control-h-lg) px-4 text-md gap-2",
};

const BASE =
  "press inline-flex items-center justify-center rounded-md font-medium tracking-[-0.015em] " +
  "whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-45";

/**
 * Classes without the element, for the cases that must render as a link.
 *
 * A `<Link>` styled as a button is correct markup; a `<button>` with an onClick that
 * navigates is not, and loses middle-click, cmd-click and the status bar with it.
 */
export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
}) {
  return (
    <button type="button" className={buttonClasses(variant, size, className)} {...props}>
      {leadingIcon && <Icon icon={leadingIcon} size={size === "sm" ? "dense" : "default"} />}
      {children}
      {trailingIcon && <Icon icon={trailingIcon} size={size === "sm" ? "dense" : "default"} />}
    </button>
  );
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "size-(--control-h-sm)",
  md: "size-(--control-h-md)",
  lg: "size-(--control-h-lg)",
};

/**
 * Square button whose icon carries the whole meaning, so `label` is required rather than
 * optional — it becomes both the accessible name and the tooltip.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], ICON_SIZES[size], "px-0", className)}
      {...props}
    >
      <Icon icon={icon} size={size === "lg" ? "nav" : size === "sm" ? "dense" : "default"} />
    </button>
  );
}
