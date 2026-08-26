/**
 * Source URLs, reduced to the identity that corroboration is actually about.
 *
 * Used by `rankConfidence` in the importer and by the provenance checks in
 * `scripts/check-seeds.ts`, which is why it lives here beside `slug.ts` rather than inside
 * either one.
 */

/**
 * Suffixes where the registrable name is the third label from the right, not the second.
 *
 * Deliberately short. A full Public Suffix List is a dependency and a monthly update for a
 * dataset whose sources are overwhelmingly `.com`; these are the ones a broadcast beat
 * actually produces. A miss here degrades to a slightly-too-specific key ("bbc.co.uk" read
 * as "co.uk"), which over-merges rather than over-splits — the safe direction, since
 * over-merging can only lower a confidence tier.
 */
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "co.jp",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "co.za",
  "com.mx",
]);

/**
 * "www.nbcsports.com" -> "nbcsports.com", "feeds.bbci.co.uk" -> "bbci.co.uk".
 *
 * Returns null when the string is not a parseable absolute URL, which callers treat as
 * "fall back to the publisher label" rather than as an error — `seeds:check` already refuses
 * a source url that is not http(s), so a null here means something upstream let it through.
 */
export function registrableDomain(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "") return null;

  const labels = host.replace(/^www\./, "").split(".");
  if (labels.length <= 2) return labels.join(".");

  const lastTwo = labels.slice(-2).join(".");
  return MULTI_PART_TLDS.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * Outlets that publish under more than one registrable domain and should still count once.
 *
 * **Ships empty, and that is the point.** Merging nbc.com with nbcsports.com is a stricter
 * rule than counting them separately, so adding an entry can only lower a stored confidence
 * tier — which makes it a deliberate act that comes with `npm run seeds:rederive`, not a
 * convenience. Add one when two domains are genuinely one newsroom saying one thing, never
 * to tidy up a list.
 *
 * Map from registrable domain to the group key it joins.
 */
const PUBLISHER_GROUPS: Record<string, string> = {};

/**
 * The publisher identity the corroboration count is about.
 *
 * `rankConfidence` promotes a record to `corroborated` on "two distinct publishers", and it
 * used to count the free-text `publisher` label. A label is a byline and bylines vary:
 * "Deadline" and "Deadline Hollywood" are one outlet and two strings, and a batch that wrote
 * both got a corroboration tier out of one publisher's word. A registrable domain does not
 * vary that way.
 *
 * The label survives as the fallback for an unparseable url, and as what the UI prints — the
 * domain is an identity, not a name.
 *
 * Measured on the seed corpus at the time of the change: keying on domain rather than label
 * moved **zero** subjects between tiers. `checkPublisherIdentity` in `scripts/check-seeds.ts`
 * is what keeps that from silently stopping being true.
 */
export function publisherKey(url: string, publisher: string): string {
  const domain = registrableDomain(url);
  if (domain === null) return publisher.trim().toLowerCase();
  return PUBLISHER_GROUPS[domain] ?? domain;
}

/**
 * Domains that can never be an `official`-tier source, whatever a batch claims.
 *
 * `official` means "the party that decides the fact said so". An encyclopedia and a fan wiki
 * are `reference` by definition — useful for finding a fact, never for confirming one — and
 * a batch that tiers one of them `official` has mislabelled it, usually by copying the tier
 * from the row above. Enforced in `seeds:check`.
 */
export const REFERENCE_DOMAINS = new Set([
  "wikipedia.org",
  "wikimedia.org",
  "wikidata.org",
  "fandom.com",
  "wikia.com",
  "imdb.com",
  "tvtropes.org",
]);

/** True when the url's domain is one no batch may cite at `official` tier. */
export function isReferenceDomain(url: string): boolean {
  const domain = registrableDomain(url);
  return domain !== null && REFERENCE_DOMAINS.has(domain);
}
