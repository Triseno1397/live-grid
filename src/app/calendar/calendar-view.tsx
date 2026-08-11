"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Panel } from "@/components/page-shell";
import { Button, IconButton } from "@/components/ui/button";
import { CalendarMonth } from "@/components/ui/calendar-month";
import { EmptyState } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { formatDateProse, formatDateShort, MIDDOT, monthName } from "@/lib/format";
import type { CalendarEvent } from "@/lib/queries/types";

type View = "month" | "agenda";

const monthKey = (date: string) => date.slice(0, 7);

export function CalendarView({
  events,
  today,
  initialYear,
  initialMonth,
}: {
  events: CalendarEvent[];
  today: string;
  initialYear: number;
  initialMonth: number;
}) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState({ year: initialYear, month: initialMonth });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cursorKey = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
  const monthEvents = useMemo(
    () => events.filter((event) => monthKey(event.date) === cursorKey),
    [events, cursorKey],
  );

  /** The side list follows the selected day; with no day chosen it shows the whole month. */
  const listed = selectedDate
    ? monthEvents.filter((event) => event.date === selectedDate)
    : monthEvents;

  function step(delta: number) {
    setSelectedDate(null);
    setCursor((current) => {
      const next = current.month + delta;
      if (next < 1) return { year: current.year - 1, month: 12 };
      if (next > 12) return { year: current.year + 1, month: 1 };
      return { ...current, month: next };
    });
  }

  const upcoming = useMemo(() => events.filter((event) => event.date >= today), [events, today]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconButton icon={ChevronLeft} label="Previous month" onClick={() => step(-1)} />
          <span className="numeric min-w-[132px] text-center text-md font-medium text-fg">
            {monthName(cursor.month)} {cursor.year}
          </span>
          <IconButton icon={ChevronRight} label="Next month" onClick={() => step(1)} />
          <Button
            size="sm"
            onClick={() => {
              setSelectedDate(null);
              setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
            }}
          >
            Today
          </Button>
        </div>

        <Tabs
          label="Calendar view"
          value={view}
          onValueChange={setView}
          options={[
            { value: "month", label: "Month" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
      </div>

      {view === "month" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <CalendarMonth
            year={cursor.year}
            month={cursor.month}
            events={monthEvents}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            today={today}
          />

          <Panel
            title={selectedDate ? formatDateProse(selectedDate) : `${monthName(cursor.month)} editions`}
            action={
              selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-sm text-fg-tertiary hover:text-fg"
                >
                  Clear
                </button>
              )
            }
            className="lg:sticky lg:top-[calc(var(--nav-h)+16px)] lg:self-start"
          >
            {listed.length === 0 ? (
              <EmptyState
                message={
                  selectedDate
                    ? "Nothing is scheduled on this date."
                    : "No editions are recorded in this month."
                }
              />
            ) : (
              <ul>
                {listed.map((event) => (
                  <AgendaRow key={event.editionId} event={event} showDate={!selectedDate} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <AgendaList events={upcoming} />
      )}
    </>
  );
}

function AgendaRow({ event, showDate }: { event: CalendarEvent; showDate: boolean }) {
  return (
    <li>
      <Link
        href={`/p/${event.productionSlug}`}
        className="flex flex-col gap-1 border-b border-line-subtle px-3 py-2.5 last:border-b-0 hover:bg-hover"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-base text-fg">{event.productionName}</span>
          {showDate && (
            <span className="numeric shrink-0 text-sm text-fg-tertiary">
              {formatDateShort(event.date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={event.status} />
          <span className="numeric truncate text-sm text-fg-tertiary">
            {[event.venue?.name, event.city?.name].filter(Boolean).join(` ${MIDDOT} `)}
          </span>
        </div>
      </Link>
    </li>
  );
}

/** Agenda view: everything ahead of today, grouped by month. */
function AgendaList({ events }: { events: CalendarEvent[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = monthKey(event.date);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return [...map.entries()];
  }, [events]);

  if (groups.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-line-subtle bg-card">
        <EmptyState message="No editions are scheduled ahead of today." />
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {groups.map(([key, list]) => (
        <Panel
          key={key}
          title={`${monthName(Number(key.slice(5, 7)))} ${key.slice(0, 4)}`}
          action={<span className="numeric text-sm text-fg-tertiary">{list.length}</span>}
        >
          <ul>
            {list.map((event) => (
              <AgendaRow key={event.editionId} event={event} showDate />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
