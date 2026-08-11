import type { Metadata } from "next";

import { PageHeader, PageShell } from "@/components/page-shell";
import { todayISO } from "@/lib/format";
import { calendarEvents, getProductions } from "@/lib/queries/productions";

import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export const revalidate = 300;

/**
 * Opening month: this one if it holds anything, otherwise the next month that does.
 *
 * The seed is front-loaded with completed editions and thin on the weeks immediately
 * ahead, so landing on an empty grid is the common case rather than the edge case. Jumping
 * to the next month with content answers "what is coming up" on arrival; the month label
 * and the Today button make where you landed obvious.
 */
function openingMonth(eventDates: string[], today: string): { year: number; month: number } {
  const currentKey = today.slice(0, 7);
  const monthsWithEvents = new Set(eventDates.map((date) => date.slice(0, 7)));

  let key = currentKey;
  if (!monthsWithEvents.has(currentKey)) {
    const ahead = [...monthsWithEvents].filter((month) => month > currentKey).sort();
    if (ahead.length > 0) key = ahead[0];
  }

  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

export default async function CalendarPage() {
  const today = todayISO();
  const productions = await getProductions();
  const events = calendarEvents(productions);

  const opening = openingMonth(
    events.map((event) => event.date),
    today,
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        lede="Every edition with a recorded date. Select a day to filter the list."
      />
      <CalendarView
        events={events}
        today={today}
        initialYear={opening.year}
        initialMonth={opening.month}
      />
    </PageShell>
  );
}
