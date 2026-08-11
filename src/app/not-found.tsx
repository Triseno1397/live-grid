import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { buttonClasses } from "@/components/ui/button";

/** One sentence, no illustration, no encouragement (DESIGN.md). */
export default function NotFound() {
  return (
    <PageShell className="flex min-h-[60dvh] flex-col justify-center">
      <p className="eyebrow text-fg-tertiary">404</p>
      <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.015em] text-fg">
        No record at this address
      </h1>
      <p className="mt-2 max-w-[52ch] text-md text-fg-secondary">
        The production, city, network or company may have been renamed. Slugs are stable, so a
        working link does not expire.
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/browse" className={buttonClasses("secondary", "md")}>
          Browse productions
        </Link>
        <Link href="/" className={buttonClasses("ghost", "md")}>
          Dashboard
        </Link>
      </div>
    </PageShell>
  );
}
