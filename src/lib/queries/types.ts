import type {
  CATEGORIES,
  CONFIDENCE_LEVELS,
  SOURCE_TIERS,
  STATUSES,
  TEAM_ROLES,
} from "@/lib/import/schema";

export type Category = (typeof CATEGORIES)[number];
export type EditionStatus = (typeof STATUSES)[number];
export type TeamRole = (typeof TEAM_ROLES)[number];
export type SourceTier = (typeof SOURCE_TIERS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * A citable document. `tier` is who was in a position to know, not how prestigious the
 * outlet is: a venue's own booking calendar outranks a trade report of the same booking.
 */
export type Source = {
  url: string;
  publisher: string;
  title: string | null;
  tier: SourceTier;
  publishedOn: string | null;
  /** When we last read it. Answers "is this stale?" — `publishedOn` does not. */
  retrievedOn: string;
  /** Which fact it backs. Null means the record generally. */
  field: string | null;
};

/**
 * How well-established a record is, derived from its citations by the importer — never
 * asserted by a seed payload. `verifiedOn` is the most recent `retrievedOn` across them.
 */
export type Verification = {
  confidence: Confidence;
  verifiedOn: string | null;
  sources: Source[];
};

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
  /**
   * Derived from citations. Carried on the base type — not just the detail type — because
   * browse filters on it, and one text column is cheaper than a second query.
   */
  confidence: Confidence;
  /** Ascending by year. */
  editions: Edition[];
  /** Ascending by year. */
  viewership: ViewershipPoint[];
};

/**
 * A production plus its team and provenance. Only the detail page reads this — the
 * dashboard and browse deliberately do not select rows they never paint.
 *
 * `editionVerification` is keyed by edition id rather than folded into `Edition` so the
 * shared `Edition` type stays the cheap shape every other surface selects.
 */
export type ProductionDetail = Production & {
  team: TeamMember[];
  verification: Verification;
  editionVerification: Record<string, Verification>;
};

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
