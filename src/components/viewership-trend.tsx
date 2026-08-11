"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatViewers } from "@/lib/format";
import type { ViewershipPoint } from "@/lib/queries/types";

/**
 * Average viewers by year.
 *
 * Deliberately not always a chart. Four of the six productions carrying viewership have a
 * single year on record, and a one-point line is a dot with axes — the number is the
 * chart. Two or more points get the line.
 *
 * The table below the plot is not a fallback, it is the point: a tooltip must never be the
 * only way to read a value. It also carries peak viewers, which the line does not plot —
 * peak and average on one plot would need two scales, and a dual-axis chart invents a
 * correlation that is not in the data.
 */
export function ViewershipTrend({ points }: { points: ViewershipPoint[] }) {
  const plotted = points.filter((point) => point.average !== null);

  if (points.length === 0) {
    return <p className="px-3 py-8 text-center text-base text-fg-tertiary">No viewership recorded.</p>;
  }

  return (
    <div className="flex flex-col">
      {plotted.length === 1 ? (
        <SinglePoint point={plotted[0]} />
      ) : plotted.length > 1 ? (
        <Plot points={plotted} />
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

function Plot({ points }: { points: ViewershipPoint[] }) {
  const last = points.at(-1)!;

  return (
    // Height covers the plot plus the x-axis band, so the card never grows a nested scroll.
    <div className="h-[200px] w-full px-1 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
          {/* Solid hairlines. A dashed grid reads as "projection" when it is just a grid. */}
          <CartesianGrid
            horizontal
            vertical={false}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            tick={{ fill: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            padding={{ left: 12, right: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(0)}M`}
          />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            content={<TrendTooltip />}
          />
          <Line
            type="linear"
            dataKey="average"
            stroke="var(--accent)"
            strokeWidth={2}
            // 8px marker, with a 2px surface ring so a dot on the grid line stays readable.
            dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface-card)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface-card)", strokeWidth: 2 }}
            isAnimationActive={false}
            // Single series: the panel title names it, so no legend box.
            name="Average viewers"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Direct-label the endpoint only — a number on every point is chaos and goes unread. */}
      <p className="numeric -mt-1 pr-1 text-right text-sm text-fg-tertiary">
        {formatViewers(last.average)} in <span className="text-fg-secondary">{last.year}</span>
      </p>
    </div>
  );
}

type TooltipPayload = { payload: ViewershipPoint }[];

function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="rounded-md border border-line bg-raised px-2.5 py-1.5 shadow-popover">
      <p className="numeric text-sm text-fg-tertiary">{point.year}</p>
      <p className="numeric text-base text-fg">{formatViewers(point.average)} average</p>
      {point.peak !== null && (
        <p className="numeric text-sm text-fg-secondary">{formatViewers(point.peak)} peak</p>
      )}
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
