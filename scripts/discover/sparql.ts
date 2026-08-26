/**
 * A very small SPARQL client for the Wikidata Query Service.
 *
 * Three things about WDQS that this exists to encapsulate, each of which is a first-run
 * failure otherwise:
 *
 *  1. **Identify yourself.** WDQS blocks Node's default agent. A descriptive User-Agent with
 *     a contact route is also the operator's stated condition of use, and this is a public
 *     service run on donations — one query at a time, with a pause, is the deal.
 *  2. **A result row is not a result.** SPARQL returns the cross-product of the OPTIONAL
 *     clauses, so an item with three websites and two images arrives as six rows. Reading
 *     rows as records is the single most common bug in scripts of this kind; `groupByItem`
 *     is why this module exists rather than a bare fetch.
 *  3. **The service times out at 60s** and says so in HTML, not JSON.
 */

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "LiveGrid-Discover/0.1 (+https://github.com/live-grid; broadcast production database seeding)";

/**
 * WDQS is a shared public service running on donations. One request at a time, with a gap.
 *
 * 2.5s rather than something snappier because this was measured the hard way: a burst of
 * debugging queries tripped the service's throttle, after which **every** query returned 504
 * for several minutes — including ones that had answered in 295ms moments earlier. A 504
 * from WDQS reads like "your query is too expensive" and is very often "you are asking too
 * often", which sends you off optimising a query that was fine. A real run makes two queries
 * per slice; the pause costs nothing and the throttle costs ten minutes of wrong diagnosis.
 */
const PAUSE_MS = 2500;
let lastRequestAt = 0;

export type SparqlValue = { type: string; value: string; datatype?: string; "xml:lang"?: string };
export type SparqlRow = Record<string, SparqlValue>;

async function pace(): Promise<void> {
  const wait = PAUSE_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

export async function runQuery(
  query: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<SparqlRow[]> {
  const { timeoutMs = 90_000, retries = 3 } = opts;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    await pace();

    let response: Response;
    try {
      // POST, form-encoded. A GET carries the query in the URL and these run past what some
      // proxies will accept once the OPTIONAL block is real.
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/sparql-results+json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      if (attempt === retries - 1) throw cause;
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === retries - 1) {
        throw new Error(
          `WDQS returned ${response.status} after ${retries} attempts. ` +
            "If this is 504 or 429, wait a couple of minutes before assuming the query is at " +
            "fault — the service throttles by returning both, and a throttled 504 looks " +
            "exactly like an expensive query.",
        );
      }
      // Respect Retry-After when offered; WDQS sends it on throttle. Otherwise back off from
      // ten seconds, not two — a fast retry into a throttle just extends it.
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      // A query timeout comes back as an HTML error page. Say so plainly rather than
      // reporting "Unexpected token <".
      const hint = /timeout|QueryTimeout/i.test(text)
        ? " — the query timed out; narrow the class walk (P279* to P279?) or raise the sitelink floor"
        : "";
      throw new Error(`WDQS ${response.status}${hint}\n${text.slice(0, 400)}`);
    }

    return (JSON.parse(text) as { results: { bindings: SparqlRow[] } }).results.bindings;
  }

  throw new Error("unreachable");
}

/**
 * Collapses the OPTIONAL cross-product back into one entry per item.
 *
 * Returns each item's rows so the caller can decide, per property, whether it wants the first
 * value or all of them — a venue should be one, an image may be several and the first is as
 * good as any.
 */
export function groupByItem(rows: SparqlRow[], key = "item"): Map<string, SparqlRow[]> {
  const grouped = new Map<string, SparqlRow[]>();
  for (const row of rows) {
    const id = row[key]?.value;
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  return grouped;
}

/** The first non-empty value of `field` across an item's rows. */
export function first(rows: SparqlRow[], field: string): string | undefined {
  for (const row of rows) {
    const value = row[field]?.value;
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/**
 * The same, for a `?xLabel` variable, skipping the label service's fallback.
 *
 * `wikibase:label` returns the bare Q-id when an item has no label in the requested
 * language. That is a sensible default for a query console and a bad value for a file:
 * "Q15014400" appeared as a venue name in the first real run, and it would have been copied
 * into a seed record as one.
 */
export function firstLabel(rows: SparqlRow[], field: string): string | undefined {
  for (const row of rows) {
    const value = row[field]?.value;
    if (value === undefined || value === "" || /^Q\d+$/.test(value)) continue;
    return value;
  }
  return undefined;
}

/** "http://www.wikidata.org/entity/Q42" -> "Q42". */
export function qid(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

/** WKT "Point(-118.24 34.05)" -> { lat, lng }. Note WKT is (lng lat), not (lat lng). */
export function parsePoint(wkt: string | undefined): { lat: number; lng: number } | undefined {
  if (!wkt) return undefined;
  const match = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  if (!match) return undefined;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

/**
 * Wikidata time values are full timestamps with a precision qualifier that a plain SELECT
 * does not carry — "2011-01-01T00:00:00Z" may mean 1 January or may mean "sometime in 2011".
 *
 * Returning both halves is the honest shape: `iso` for a real day, `year` when that is all
 * that is actually being claimed. Callers never turn one into a `start_date`.
 */
export function parseTime(value: string | undefined): { iso: string; year: number } | undefined {
  if (!value) return undefined;
  const match = /^(-?\d{4,})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return undefined;
  return { iso: value.slice(0, 10), year };
}

/**
 * A Commons file name as a fetchable URL.
 *
 * `Special:FilePath` redirects to the current file and takes a width, which is what makes it
 * usable directly in `next/image` — `next.config.ts` already allows any https host.
 */
export function commonsUrl(value: string | undefined, width = 512): string | undefined {
  if (!value) return undefined;
  // SPARQL returns these already as http://commons.wikimedia.org/wiki/Special:FilePath/...
  const name = value.includes("Special:FilePath/") ? value.split("Special:FilePath/")[1] : value;
  if (!name) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=${width}`;
}
