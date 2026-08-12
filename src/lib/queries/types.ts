import type { CATEGORIES, STATUSES, TEAM_ROLES } from "@/lib/import/schema";

export type Category = (typeof CATEGORIES)[number];
export type EditionStatus = (typeof STATUSES)[number];
export type TeamRole = (typeof TEAM_ROLES)[number];

/** A named thing with a page of its own. */
export type Ref = { name: string; slug: string };

export type CityRef = Ref & { state: string | null };
export type VenueRef = Ref & { capacity: number | null };

/**
 * The load-in -> strike schedule. Every field is nullable and, in the current data, usually
 * is: only `showDate` is widely populated. Renderers show populated fields only — an empty
 * timeline row would imply the schedule is known and blank, which is the opposite of true.
 */
export type EditionTimeline = {
  loadIn: string | null;
  techRehearsal: string | null;
  dressRehearsal: string | null;
  showDate: string | null;
  strike: string | null;
};

export type Edition = {
  id: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  status: EditionStatus;
  city: CityRef | null;
  venue: VenueRef | null;
  /** Set only where this year's broadcaster differs from the production default. */
  network: Ref | null;
  timeline: EditionTimeline;
};

export type ViewershipPoint = {
  year: number;
  average: number | null;
  peak: number | null;
};

/**
 * Who makes the show. Either a company, a named person, or both — a lighting credit
 * naming a designer and their shop is one row, not two.
 *
 * `editionId` null means the entry applies to the production generally rather than to one
 * year, which is the honest shape for a long-running show whose producer has not changed.
 */
export type TeamMember = {
  role: TeamRole;
  company: Ref | null;
  personName: string | null;
  note: string | null;
  editionId: string | null;
  sortOrder: number;
};

export type Production = {
  id: string;
  name: string;
  slug: string;
  category: Category;
  subcategory: string | null;
  scale: number | null;
  typicalMonth: number | null;
  recurring: boolean;
  description: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  network: Ref | null;
  company: Ref | null;
  /** Ascending by year. */
  editions: Edition[];
  /** Ascending by year. */
  viewership: ViewershipPoint[];
};

/**
 * A production plus its team. Only the detail page reads this — the dashboard and browse
 * deliberately do not select team rows they never paint.
 */
export type ProductionDetail = Production & { team: TeamMember[] };

/**
 * A production paired with the one edition that matters right now, plus the countdown.
 *
 * `daysOut` is null when the edition has no `start_date` — 13 of 40 editions currently sit
 * in that state, and they must stay visible rather than being filtered into nothing.
 */
export type ProductionEntry = {
  production: Production;
  edition: Edition | null;
  daysOut: number | null;
  /** True when `edition` is in the future; false when it is the most recent past one. */
  isUpcoming: boolean;
};

/** One edition flattened against its production — the shape the calendar and agenda want. */
export type CalendarEvent = {
  editionId: string;
  date: string;
  endDate: string | null;
  year: number;
  status: EditionStatus;
  productionName: string;
  productionSlug: string;
  category: Category;
  city: CityRef | null;
  venue: VenueRef | null;
  network: Ref | null;
};

export type SummaryStats = {
  productions: number;
  editions: number;
  cities: number;
  upcoming: number;
  rumored: number;
};

export type SearchGroup = "production" | "venue" | "city" | "network" | "company";

export type SearchHit = {
  group: SearchGroup;
  name: string;
  slug: string;
  /** Second line: category for productions, city for venues, state for cities. */
  detail: string | null;
  href: string;
};
