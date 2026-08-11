"use client";

import dynamic from "next/dynamic";

import type { ViewershipPoint } from "@/lib/queries/types";

/**
 * The lazy boundary for Recharts, and the reason it is a client component.
 *
 * `dynamic()` called from a *server* component does not defer anything: Next still lists
 * the client reference in the route's manifest and preloads its chunk. Verified against
 * the build output — the 380kB recharts chunk was being preloaded on /p/family-feud, a
 * production with no viewership row at all. Moving the boundary into client code turns it
 * into a real runtime `import()`, so the chunk is fetched only when a plot actually mounts.
 *
 * `ssr: false` is the cost of that. It is worth paying here: the chart sits below the fold
 * on 2 of 34 pages, and the table beside it is server-rendered, so no value is ever gated
 * behind JavaScript arriving.
 */
const Plot = dynamic(() => import("./viewership-plot"), {
  ssr: false,
  // Same height as the plot, so the panel does not jump when the chunk lands.
  loading: () => <div className="h-[200px] w-full" aria-hidden />,
});

export function LazyViewershipPlot({ points }: { points: ViewershipPoint[] }) {
  return <Plot points={points} />;
}
