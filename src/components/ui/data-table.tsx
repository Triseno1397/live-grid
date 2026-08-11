import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * Table parts rather than one closed component.
 *
 * Browse drives its table with TanStack; the edition history and city listings are plain
 * server-rendered rows that need no table library at all. Both should look identical, so
 * what is shared here is the paint, not the state.
 *
 * 34px sticky header, 40px rows (32 dense), hairline dividers, hover fill — DESIGN.md.
 */

export function TableScroller({ className, children }: HTMLAttributes<HTMLDivElement>) {
  // Wide tables scroll inside their own container; the page body never scrolls sideways.
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-base", className)} {...props}>
      {children}
    </table>
  );
}

export function THead({
  className,
  children,
  sticky = true,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) {
  // Sticky is right for a full-page table like browse, and wrong inside a panel — there it
  // would lift off the card and overlay the rows below as the page scrolls.
  return (
    <thead className={cn(sticky && "sticky top-(--nav-h) z-10 bg-page", className)} {...props}>
      {children}
    </thead>
  );
}

export type SortDirection = "asc" | "desc" | false;

export function TH({
  className,
  children,
  numeric = false,
  sorted,
  onSort,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  numeric?: boolean;
  /** `false` means sortable but not currently sorted; omit entirely for a static column. */
  sorted?: SortDirection;
  onSort?: () => void;
}) {
  const sortable = onSort !== undefined;

  return (
    <th
      scope="col"
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      className={cn(
        // No background of its own: table cells paint above the row group, so the sticky
        // thead's fill shows through transparent cells in both the page and panel contexts.
        "eyebrow h-(--head-h) border-b border-line-subtle px-3 text-left align-middle",
        "font-medium text-fg-tertiary",
        numeric && "text-right",
        className,
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "eyebrow inline-flex items-center gap-1 hover:text-fg",
            "[transition:var(--transition-control)]",
            numeric && "flex-row-reverse",
            sorted && "text-fg",
          )}
        >
          {children}
          <SortArrow direction={sorted ?? false} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/** ▲▼ in the accent (DESIGN.md). Reserves its width so a header does not shift on sort. */
function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block w-2 text-center text-2xs leading-none",
        direction ? "text-accent" : "text-fg-disabled",
      )}
    >
      {direction === "desc" ? "▼" : "▲"}
    </span>
  );
}

export function TBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

export function TR({
  className,
  children,
  dense = false,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { dense?: boolean; interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-line-subtle",
        dense ? "h-(--row-h-dense)" : "h-(--row-h)",
        interactive && "cursor-pointer hover:bg-hover",
        "[transition:background-color_var(--duration-fast)_var(--ease-standard)]",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({
  className,
  children,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 align-middle text-base text-fg-secondary",
        numeric && "numeric text-right tabular-nums",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** One sentence. No illustration, no encouragement (DESIGN.md). */
export function TableEmpty({ message, colSpan }: { message: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-base text-fg-tertiary">
        {message}
      </td>
    </tr>
  );
}

export function EmptyState({ message, className }: { message: string; className?: string }) {
  return (
    <p className={cn("px-3 py-8 text-center text-base text-fg-tertiary", className)}>{message}</p>
  );
}
