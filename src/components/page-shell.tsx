import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Page container. One max width and one horizontal padding for every route, so the nav's
 * wordmark and the page's first column share a left edge on every screen.
 */
export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto w-full max-w-(--page-max) px-4 pb-16 pt-6", className)}>
      {children}
    </main>
  );
}

/**
 * Sentence-case title over an optional uppercase eyebrow (DESIGN.md), with room for one
 * control on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5 text-fg-tertiary">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {lede && <div className="mt-1.5 text-md text-fg-secondary">{lede}</div>}
      </div>
      {action}
    </header>
  );
}

/** A titled panel: hairline rule under an eyebrow, content below. Used in the side rails. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-line-subtle bg-card", className)}>
      <div className="flex h-(--head-h) items-center justify-between gap-3 border-b border-line-subtle px-3">
        <h2 className="eyebrow text-fg-tertiary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
