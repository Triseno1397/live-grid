import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { runScan, type ScanResult } from "@/lib/scan";

// The service-role client requires the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One scan per minute per server instance. The scan is idempotent, so the throttle is not
 * protecting correctness — it stops a held-down button or a crawler from turning into a
 * write and a full-site revalidation on every request. A throttled call gets the last
 * result back rather than an error, because from the caller's side the grid is current.
 */
const THROTTLE_MS = 60_000;
let last: { at: number; result: ScanResult } | null = null;

async function scan() {
  if (last && Date.now() - last.at < THROTTLE_MS) {
    return NextResponse.json({ ok: true, throttled: true, ...last.result });
  }

  let result: ScanResult;
  try {
    result = await runScan();
  } catch (cause) {
    return NextResponse.json(
      { ok: false, error: cause instanceof Error ? cause.message : "Scan failed." },
      { status: 500 },
    );
  }

  last = { at: Date.now(), result };

  // Every page is a view of the same rows, so the whole tree is regenerated rather than a
  // hand-kept list of routes that would drift the next time a page is added.
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, throttled: false, ...result });
}

/** POST /api/scan — the dashboard's Scan button. Public: see runScan for why that is safe. */
export async function POST() {
  return scan();
}

/**
 * GET /api/scan — the daily Vercel cron (vercel.json).
 *
 * Where CRON_SECRET is set, Vercel sends it as a bearer token and anything else is refused.
 * The daily run also keeps the Supabase project active, which is what stops the free tier
 * from pausing it and freezing the site on a stale render.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  return scan();
}
