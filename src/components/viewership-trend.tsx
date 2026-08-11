import { LazyViewershipPlot } from "@/components/viewership-plot-lazy";
import { formatViewers } from "@/lib/format";
import type { ViewershipPoint } from "@/lib/queries/types";

/**
 * Average viewers by year.
 *
 * Deliberately not always a chart. Four of the six productions carrying viewership have a
 * single year on record, and a one-point line is a dot with axes — the number is the
 * chart, so it renders as a stat tile instead. Two or more points get the line.
 *
 * The table below the plot is not a fallback, it is the point: a tooltip must never be
 * the only way to read a value. It also carries peak viewers, which the line does not
 * plot — peak and average on one plot would need two y-scales, and a dual-axis chart
 * invents a correlation that is not in the data.
 */
export function ViewershipTrend({ points }: { points: ViewershipPoint[] }) {
  const plotted = points.filter((point) => point.average !== null);

  if (points.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-base text-fg-tertiary">No viewership recorded.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {plotted.length === 1 ? (
        <SinglePoint point={plotted[0]} />
      ) : plotted.length > 1 ? (
        <LazyViewershipPlot points={plotted} />
      ) : null}

      <ViewershipTable points={points} />
    </div>
  );
}

/** One year on record: a stat tile, not a chart. */
function SinglePoint({ point }: { point: ViewershipPoint }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-4">
      <span className="numeric text-4xl font-semibold leading-none text-fg">
        {formatViewers(point.average)}
      </span>
      <span className="text-base text-fg-secondary">
        average viewers, <span className="numeric">{point.year}</span>
      </span>
    </div>
  );
}

/** The table twin. Every plotted value is readable without hovering anything. */
function ViewershipTable({ points }: { points: ViewershipPoint[] }) {
  return (
    <table className="w-full border-t border-line-subtle text-base">
      <caption className="sr-only">Viewership by year, in millions</caption>
      <thead>
        <tr>
          <th scope="col" className="eyebrow h-8 px-3 text-left font-medium text-fg-tertiary">
            Year
          </th>
          <th scope="col" className="eyebrow h-8 px-3 text-right font-medium text-fg-tertiary">
            Average
          </th>
          <th scope="col" className="eyebrow h-8 px-3 text-right font-medium text-fg-tertiary">
            Peak
          </th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.year} className="border-t border-line-subtle">
            <td className="numeric h-8 px-3 tabular-nums text-fg-secondary">{point.year}</td>
            <td className="numeric h-8 px-3 text-right tabular-nums text-fg">
              {formatViewers(point.average)}
            </td>
            <td className="numeric h-8 px-3 text-right tabular-nums text-fg-secondary">
              {formatViewers(point.peak)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
