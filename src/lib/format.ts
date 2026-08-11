/**
 * Shared formatters. Every number in Live Grid is typeset (DESIGN.md): mono, tabular,
 * and formatted in exactly one place so a date never renders two ways on two pages.
 *
 * Nothing here uses `new Date(iso)` on a bare date string. Postgres `date` columns carry no
 * timezone, but `new Date("2027-03-14")` parses as UTC midnight and then renders in local
 * time — which shows March 13 to anyone west of Greenwich. All parsing below is explicit.
 */

/** Missing value. Never a zero, never a guess (DESIGN.md copy rules). */
export const EM_DASH = "—";

/** Middot separator used in metadata lines. */
export const MIDDOT = "·";

/**
 * Live Grid's reference day is the US broadcast day. The audience is US-based and the
 * data is US-centric, so a countdown must not tick over at 5pm Pacific because the
 * server happens to run on UTC.
 */
const BROADCAST_TZ = "America/New_York";

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Today in the broadcast timezone, as YYYY-MM-DD. `en-CA` is ISO-shaped by definition. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BROADCAST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function epochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((epochDay(to) - epochDay(from)) / 86_400_000);
}

/** Prose form: "Feb 1, 2027". Used in sentences and cards. */
export function formatDateProse(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

/** Short form without the year: "Feb 1". For lists already scoped to one year. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}`;
}

/** Table form: the ISO string itself, so columns of dates align and sort visually. */
export function formatDateISO(iso: string | null | undefined): string {
  return iso ?? EM_DASH;
}

/**
 * A date range, collapsing to a single date when the run is one day — which is the
 * common case, since most editions have no end_date at all.
 */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return EM_DASH;
  if (!end || end === start) return formatDateProse(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? formatDateShort(start) : formatDateProse(start)} – ${formatDateProse(end)}`;
}

/** Viewership in millions to one decimal (DESIGN.md). 19_690_000 -> "19.7M". */
export function formatViewers(n: number | null | undefined): string {
  if (n == null) return EM_DASH;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function monthAbbr(month: number): string {
  return MONTH_ABBR[month - 1] ?? EM_DASH;
}

export function monthName(month: number): string {
  return MONTH_FULL[month - 1] ?? EM_DASH;
}

/** Human label for the schema's snake_case category enum. */
export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

/**
 * Countdown wording. Positive is ahead, negative is behind, zero is today.
 * Returns the caption only — the number is rendered separately at display size.
 */
export function countdownCaption(days: number): string {
  if (days === 0) return "today";
  const n = Math.abs(days);
  return `${n === 1 ? "day" : "days"} ${days > 0 ? "out" : "ago"}`;
}

/** Calendar helpers — the month grid is hand-built, so it needs these. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday index for the 1st of the month, 0 = Sunday. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

/** Build a YYYY-MM-DD string without touching the local timezone. */
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
