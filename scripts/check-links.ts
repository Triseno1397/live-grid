/**
 * Live Grid — do the citations point at anything?
 *
 * Run with `npm run seeds:links [-- --db | --file <glob> | --url <u>]`.
 *
 * `seeds:check` validates the SHAPE of a citation thoroughly: the url is http(s), the tier is
 * one of three, the retrieval date parses. It has no opinion on whether the page exists.
 * That gap is the highest-risk failure mode in a corpus assembled by research sessions — a
 * plausible-looking URL that was never read is indistinguishable, to every other gate in this
 * repo, from one that was. This is the check that tells them apart.
 *
 * Deliberately NOT wired into `seeds:check`. That script is deterministic, offline and fast,
 * and it gates every import; this one is none of those. Run it once per batch and on a
 * schedule over the whole corpus.
 *
 * Exit code 1 on any error. Warnings and skips never fail the run.
 */

import { basename } from "node:path";

import { registrableDomain } from "../src/lib/url";
import { allSourcesOf, loadSeedRecords, type SourceLike } from "./lib/seeds";

const USER_AGENT = "LiveGrid-LinkCheck/0.1 (+https://github.com/live-grid; seed provenance check)";
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

/**
 * Hosts that refuse automated requests outright.
 *
 * A 401/403/429 from one of these is a bot wall, not a dead link, and reporting it as an
 * error is how a checker gets ignored. `seeds/PROGRESS.md` has been recording which sites do
 * this since the sweep started; this is that list, in code.
 *
 * **Only 401/403/429 are forgiven. A 404 from a walled host is still an error** — otherwise
 * the allow-list defeats the one thing this script exists for. `press.oscars.org` is in the
 * current corpus and is exactly that case: the domain walls robots, and an invented article
 * path under it must still fail loudly.
 */
const BOT_WALLED = new Set([
  "oscars.org",
  "variety.com",
  "hollywoodreporter.com",
  "deadline.com",
  "sportico.com",
  "si.com",
  "billboard.com",
  "nytimes.com",
  "wsj.com",
  "bloomberg.com",
  // League and broadcaster sites that 403 or reset a non-browser agent. All three are
  // `official`-tier sources the sweep depends on, so leaving them off the list would put
  // four permanent errors in front of every real one.
  "nba.com",
  "espn.com",
  "fox59.com",
]);

/**
 * Redirect targets that are the same publisher wearing a different domain.
 *
 * A cross-domain redirect usually means a link rotted into a homepage, which is worth a
 * warning. These are the ones where it means a corporate parent answers for a brand —
 * kentuckyderby.com → churchilldowns.com is in the corpus today and is not a finding.
 */
const REDIRECT_ALIASES = new Map<string, string>([
  ["kentuckyderby.com", "churchilldowns.com"],
  ["churchilldowns.com", "churchilldowns.com"],
]);

/** A redirect here means the article is behind a wall, not that the link is wrong. */
const PAYWALL_PATTERNS = [/\.piano\.io$/, /\.tinypass\.com$/, /^login\./, /^subscribe\./];

type Status = number | "timeout" | "dns-failure" | "unreachable";

type LinkResult = {
  url: string;
  publisher: string;
  tier: string;
  status: Status;
  finalUrl: string | null;
  ms: number;
  seenIn: string[];
  verdict: "ok" | "warn" | "error" | "skipped";
  note: string;
};

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * One serial lock per host.
 *
 * Six concurrent requests spread over forty hosts is polite; six concurrent requests at one
 * host is what turns a 200 into a 429 and makes this script generate its own findings.
 */
const hostLocks = new Map<string, Promise<unknown>>();

function withHostLock<T>(host: string, run: () => Promise<T>): Promise<T> {
  const previous = hostLocks.get(host) ?? Promise.resolve();
  const next = previous.then(run, run);
  hostLocks.set(
    host,
    next.catch(() => undefined),
  );
  return next;
}

async function request(url: string, method: "HEAD" | "GET"): Promise<Response> {
  return fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      // Ask for the first 2KB on the GET fallback. Politeness, and it keeps a check over a
      // few hundred URLs from pulling down megabytes of article HTML nobody reads.
      ...(method === "GET" ? { range: "bytes=0-2047" } : {}),
    },
  });
}

/**
 * Why a request failed before it ever got a status line.
 *
 * The distinction carries the whole weight of this script. A hostname that does not resolve
 * cannot have been read by anyone — that is a fabricated or long-dead citation, and it is an
 * error. A connection that resolves and is then refused or reset is a site declining to talk
 * to a robot, which is a fact about the site and not about the citation.
 *
 * Undici hangs the OS error code off `cause.cause.code`, which is the only place the two are
 * actually distinguishable.
 */
function failureKind(cause: unknown): "dns" | "timeout" | "unreachable" {
  if (cause instanceof Error && /timeout|abort/i.test(`${cause.name}${cause.message}`)) {
    return "timeout";
  }
  const code =
    cause instanceof Error && cause.cause instanceof Error && "code" in cause.cause
      ? String((cause.cause as { code: unknown }).code)
      : "";
  return code === "ENOTFOUND" || code === "EAI_AGAIN" ? "dns" : "unreachable";
}

async function checkUrl(url: string): Promise<{ status: Status; finalUrl: string | null; ms: number }> {
  const startedAt = Date.now();
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  return withHostLock(host, async () => {
    /**
     * HEAD first, then a ranged GET.
     *
     * The fallback has to cover a HEAD that THROWS, not just one that answers badly:
     * si.com resets the connection on HEAD and serves 200 to GET, and treating the reset as
     * final reported a perfectly good citation as a dead host. Any HEAD failure — status or
     * exception — falls through to GET, and only a GET failure is a verdict.
     */
    const attempt = async (): Promise<{ status: Status; finalUrl: string | null }> => {
      let headFailure: unknown = null;
      try {
        const response = await request(url, "HEAD");
        if (response.status < 400 && response.status !== 405 && response.status !== 501) {
          return { status: response.status, finalUrl: response.url || null };
        }
      } catch (cause) {
        headFailure = cause;
      }

      try {
        const response = await request(url, "GET");
        return { status: response.status, finalUrl: response.url || null };
      } catch (cause) {
        // Prefer the GET's diagnosis; fall back to the HEAD's if the GET was less specific.
        const kind = failureKind(cause);
        const headKind = headFailure === null ? null : failureKind(headFailure);
        const worst = kind === "dns" || headKind === "dns" ? "dns" : kind;
        return {
          status: worst === "timeout" ? "timeout" : worst === "dns" ? "dns-failure" : "unreachable",
          finalUrl: null,
        };
      }
    };

    let result = await attempt();
    const retryable =
      result.status === "timeout" ||
      result.status === "unreachable" ||
      (typeof result.status === "number" && result.status >= 500);
    if (retryable) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await attempt();
    }

    return { ...result, ms: Date.now() - startedAt };
  });
}

/** Bounded fan-out. Deliberately tiny — a queue library for eleven lines would be worse. */
async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(
  url: string,
  status: Status,
  finalUrl: string | null,
): { verdict: LinkResult["verdict"]; note: string } {
  const domain = registrableDomain(url);
  const walled = domain !== null && BOT_WALLED.has(domain);

  if (status === "timeout") return { verdict: "warn", note: "timed out twice" };

  // The one failure no allow-list forgives: a hostname that does not resolve was never read
  // by anyone. This is the fabricated-citation case, and it is an error even on a host that
  // otherwise walls robots.
  if (status === "dns-failure") {
    return { verdict: "error", note: "hostname does not resolve" };
  }

  // Resolved, then refused or reset. Indistinguishable from an aggressive bot wall — and
  // several of the corpus's official sources behave exactly this way — so it is a warning to
  // read, not a verdict on the citation.
  if (status === "unreachable") {
    return {
      verdict: "warn",
      note: walled
        ? "connection refused or reset — known bot wall, unverified"
        : "connection refused or reset — could not verify",
    };
  }

  if (status === 404 || status === 410) {
    return {
      verdict: "error",
      note: walled ? `HTTP ${status} — not the bot wall, this path is gone` : `HTTP ${status}`,
    };
  }

  if (status === 401 || status === 403 || status === 429) {
    return walled
      ? { verdict: "skipped", note: `HTTP ${status} — known bot wall` }
      : { verdict: "warn", note: `HTTP ${status} — blocked, may be a bot wall` };
  }

  if (status >= 500) return { verdict: "warn", note: `HTTP ${status}` };
  if (status >= 400) return { verdict: "warn", note: `HTTP ${status}` };

  // 2xx/3xx from here. The remaining questions are about where it landed.
  if (finalUrl && finalUrl !== url) {
    const from = registrableDomain(url);
    const to = registrableDomain(finalUrl);
    if (to !== null && PAYWALL_PATTERNS.some((p) => p.test(new URL(finalUrl).hostname))) {
      return { verdict: "warn", note: `redirects to a paywall host (${to})` };
    }
    if (from !== null && to !== null && from !== to && REDIRECT_ALIASES.get(from) !== to) {
      return { verdict: "warn", note: `redirects off-domain: ${from} → ${to}` };
    }
  }

  if (url.startsWith("http://") && !finalUrl?.startsWith("https://")) {
    return { verdict: "warn", note: "plain http, does not upgrade" };
  }

  return { verdict: "ok", note: "" };
}

// ---------------------------------------------------------------------------
// Collecting the URLs to check
// ---------------------------------------------------------------------------

type Ref = { url: string; publisher: string; tier: string; seenIn: Set<string> };

function collectFromSeeds(fileFilter: ((file: string) => boolean) | null): Ref[] {
  const { loaded, errors } = loadSeedRecords();
  for (const problem of errors) {
    console.error(`  ${problem.file} — ${problem.record}: ${problem.message}`);
  }

  const refs = new Map<string, Ref>();
  for (const { file, record } of loaded) {
    if (fileFilter && !fileFilter(file)) continue;
    const name = typeof record.name === "string" ? record.name : "?";
    for (const source of allSourcesOf(record)) {
      addRef(refs, source, `${file} — ${name}`);
    }
  }
  return [...refs.values()];
}

function addRef(refs: Map<string, Ref>, source: SourceLike, seenIn: string): void {
  if (typeof source.url !== "string") return;
  const existing = refs.get(source.url);
  if (existing) {
    existing.seenIn.add(seenIn);
    return;
  }
  refs.set(source.url, {
    url: source.url,
    publisher: typeof source.publisher === "string" ? source.publisher : "?",
    tier: typeof source.tier === "string" ? source.tier : "?",
    seenIn: new Set([seenIn]),
  });
}

/**
 * The same URLs, but as the database actually holds them.
 *
 * Files and rows can diverge: a source imported months ago and since edited in place, or a
 * batch file deleted after import. `--db` is how the standing sweep catches rot in what is
 * live rather than in what is staged.
 */
async function collectFromDb(): Promise<Ref[]> {
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const db = createServiceClient();
  const { data, error } = await db.from("sources").select("url, publisher, tier");
  if (error) throw new Error(`sources: ${error.message}`);
  return (data ?? []).map((row) => ({
    url: row.url,
    publisher: row.publisher,
    tier: row.tier,
    seenIn: new Set(["database"]),
  }));
}

/** Single-directory `*` matching, matching `import-seeds.ts` — see the note there. */
function globMatcher(pattern: string): (file: string) => boolean {
  const base = basename(pattern);
  const regex = new RegExp(
    `^${base
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  return (file: string) => regex.test(file);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const single = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : null;
  const fromDb = argv.includes("--db");
  const fileArg = argv.includes("--file") ? argv[argv.indexOf("--file") + 1] : null;

  let refs: Ref[];
  if (single) {
    refs = [{ url: single, publisher: "—", tier: "—", seenIn: new Set(["--url"]) }];
  } else if (fromDb) {
    refs = await collectFromDb();
  } else {
    refs = collectFromSeeds(fileArg ? globMatcher(fileArg) : null);
  }

  if (refs.length === 0) {
    console.log("No source URLs to check.");
    return;
  }

  console.log(
    `Checking ${refs.length} distinct URL(s) across ${new Set(refs.map((r) => registrableDomain(r.url))).size} domain(s)…\n`,
  );

  const startedAt = Date.now();
  const results = await pool(refs, CONCURRENCY, async (ref): Promise<LinkResult> => {
    const { status, finalUrl, ms } = await checkUrl(ref.url);
    const { verdict, note } = classify(ref.url, status, finalUrl);
    return {
      url: ref.url,
      publisher: ref.publisher,
      tier: ref.tier,
      status,
      finalUrl,
      ms,
      seenIn: [...ref.seenIn],
      verdict,
      note,
    };
  });

  const by = (verdict: LinkResult["verdict"]) => results.filter((r) => r.verdict === verdict);
  const errors = by("error");
  const warnings = by("warn");
  const skipped = by("skipped");

  const show = (label: string, rows: LinkResult[]) => {
    if (rows.length === 0) return;
    console.log(`${label} (${rows.length}):`);
    for (const row of rows) {
      console.log(`  ${row.note}`);
      console.log(`    ${row.url}`);
      console.log(`    ${row.publisher} · ${row.tier} · cited by ${row.seenIn.slice(0, 3).join("; ")}`);
    }
    console.log("");
  };

  show("SKIPPED — bot wall, not a dead link", skipped);
  show("WARNINGS", warnings);
  show("ERRORS", errors);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `${results.length} checked in ${seconds}s — ` +
      `${by("ok").length} ok, ${warnings.length} warning(s), ${skipped.length} skipped, ${errors.length} error(s).`,
  );

  if (errors.length > 0) {
    console.log("\nAn error here means a cited page is gone or was never there. Fix the citation.");
    process.exit(1);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? (cause.stack ?? cause.message) : String(cause));
  process.exit(1);
});
