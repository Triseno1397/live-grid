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
 * The Recharts half of the viewership panel, split into its own module so it can be
 * loaded lazily.
 *
 * Recharts is ~114kB, and only 6 of 34 productions carry viewership at all — 2 of those
 * have enough points to plot. Importing it from the page directly put that weight on every
 * production page to render nothing. See viewership-trend.tsx for the split.
 */
export default function ViewershipPlot({ points }: { points: ViewershipPoint[] }) {
  const last = points.at(-1)!;

  return (
    // Height covers the plot plus the x-axis band, so the card never grows a nested scroll.
    <div className="h-[200px] w-full px-1 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
          {/* Solid hairlines. A dashed grid reads as "projection" when it is just a grid. */}
          <CartesianGrid horizontal vertical={false} stroke="var(--border-subtle)" strokeWidth={1} />
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
            // 8px marker, with a 2px surface ring so a dot on a grid line stays readable.
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
