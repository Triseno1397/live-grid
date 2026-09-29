import "server-only";

import { todayISO } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The statuses a scan is allowed to close out. Both describe a show that was going to
 * happen; once its last day is behind us, `completed` is the only honest word for it.
 *
 * `rumored` is deliberately absent. A rumor that reached its date was never confirmed, and
 * marking it completed would assert a fact nobody sourced — it stays rumored and simply
 * moves to /past. `cancelled` is already terminal.
 */
const CLOSABLE = ["confirmed", "announced"] as const;

export type ScanResult = {
  /** The broadcast day the scan ran against (YYYY-MM-DD). */
  today: string;
  /** ISO timestamp of the scan. */
  scannedAt: string;
  /** Editions moved to `completed` by this scan. Empty when the grid was already current. */
  closedOut: { production: string; slug: string; year: number }[];
};

/**
 * Close out every edition whose final day has passed.
 *
 * Deterministic and date-only: it reads no external source, writes no new fact and touches
 * no citation or confidence, which is what makes it safe to expose as a public button. The
 * only column it changes is `status`, and only from confirmed/announced to completed.
 *
 * Runs through the service-role client because RLS allows writes only to editors, and a
 * scan is a system transition rather than an editorial one.
 */
export async function runScan(now = new Date()): Promise<ScanResult> {
  const today = todayISO(now);
  const db = createAdminClient();

  // Past = end_date before today, or start_date before today for a one-day (no end) edition.
  const { data, error } = await db
    .from("editions")
    .update({ status: "completed" })
    .in("status", [...CLOSABLE])
    // Dateless editions (no start_date) are never past, matching isPast() on the read side.
    .not("start_date", "is", null)
    .or(`end_date.lt.${today},and(end_date.is.null,start_date.lt.${today})`)
    .select("year, productions(name, slug)");

  if (error) throw new Error(`scan failed: ${error.message}`);

  const closedOut = (data ?? [])
    .map((row) => ({
      production: row.productions?.name ?? "Unknown production",
      slug: row.productions?.slug ?? "",
      year: row.year,
    }))
    .sort((a, b) => a.production.localeCompare(b.production));

  return { today, scannedAt: now.toISOString(), closedOut };
}
