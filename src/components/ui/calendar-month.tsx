import { cn } from "@/lib/cn";
import { daysInMonth, firstWeekdayOfMonth, isoDate } from "@/lib/format";
import type { CalendarEvent, EditionStatus } from "@/lib/queries/types";

/**
 * Hand-built CSS grid. FullCalendar is cut from the stack permanently (AGENTS.md) — it
 * fights Tailwind and never looks right in a dark, dense layout.
 *
 * Three events per cell then "+n more" (DESIGN.md). The cap is what keeps the grid on a
 * fixed rhythm: one busy day should not stretch its whole week and shove the rest of the
 * month down the page.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const STATUS_DOT: Record<EditionStatus, string> = {
  confirmed: "bg-confirmed",
  announced: "bg-announced",
  rumored: "bg-rumored",
  completed: "bg-completed",
  cancelled: "bg-cancelled",
};

const MAX_VISIBLE = 3;

type Cell = { date: string; day: number; inMonth: boolean };

/**
 * Six weeks of cells, always starting on a Sunday.
 *
 * Days from the neighbouring months are rendered rather than left blank so the grid keeps
 * its shape; they sit on the sunken surface to read as out of scope.
 */
function buildCells(year: number, month: number): Cell[] {
  const lead = firstWeekdayOfMonth(year, month);
  const count = daysInMonth(year, month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevCount = daysInMonth(prevYear, prevMonth);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: Cell[] = [];

  for (let i = lead; i > 0; i--) {
    const day = prevCount - i + 1;
    cells.push({ date: isoDate(prevYear, prevMonth, day), day, inMonth: false });
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ date: isoDate(year, month, day), day, inMonth: true });
  }
  let day = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: isoDate(nextYear, nextMonth, day), day, inMonth: false });
    day++;
  }
  return cells;
}

export function CalendarMonth({
  year,
  month,
  events,
  selectedDate,
  onSelectDate,
  today,
  className,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  /** Passed in rather than read from the clock, so server and client agree. */
  today: string;
  className?: string;
}) {
  const cells = buildCells(year, month);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line-subtle bg-card", className)}>
      <div className="grid grid-cols-7 border-b border-line-subtle">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="eyebrow px-2 py-2 text-fg-tertiary">
            <span className="sm:hidden">{weekday[0]}</span>
            <span className="max-sm:hidden">{weekday}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEvents = byDate.get(cell.date) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          const selected = cell.date === selectedDate;
          const isToday = cell.date === today;

          return (
            <button
              key={cell.date}
              type="button"
              // Clicking the selected day again clears the filter rather than trapping it.
              onClick={() => onSelectDate(selected ? null : cell.date)}
              aria-pressed={selected}
              aria-label={`${cell.date}, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}
              className={cn(
                "flex min-h-[64px] flex-col gap-1 border-b border-r border-line-subtle p-1.5 text-left sm:min-h-[96px]",
                "[transition:background-color_var(--duration-fast)_var(--ease-standard)]",
                cell.inMonth ? "bg-card hover:bg-hover" : "bg-sunken",
                selected && "bg-active",
              )}
            >
              <span
                className={cn(
                  "numeric text-sm tabular-nums",
                  cell.inMonth ? "text-fg-secondary" : "text-fg-disabled",
                  isToday && "font-semibold text-accent",
                )}
              >
                {cell.day}
              </span>

              {/* Names need room to be worth reading; at 390px a 52px column has none,
                  so below sm the cell carries dots alone. */}
              <span className="flex gap-1 sm:hidden">
                {visible.map((event) => (
                  <span
                    key={event.editionId}
                    className={cn("size-1 rounded-full", STATUS_DOT[event.status])}
                  />
                ))}
              </span>

              <span className="hidden flex-col gap-0.5 sm:flex">
                {visible.map((event) => (
                  <span key={event.editionId} className="flex items-center gap-1">
                    <span
                      className={cn("size-1 shrink-0 rounded-full", STATUS_DOT[event.status])}
                    />
                    <span className="truncate text-2xs text-fg-secondary">
                      {event.productionName}
                    </span>
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="numeric pl-2 text-2xs text-fg-tertiary">+{overflow} more</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
