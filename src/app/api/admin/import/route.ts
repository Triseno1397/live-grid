import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runImport } from "@/lib/import/importer";
import { ImportEnvelope } from "@/lib/import/schema";
import { createAdminClient } from "@/lib/supabase/admin";

// node:crypto and the service-role client both require the Node runtime.
export const runtime = "nodejs";

/**
 * Constant-time comparison over SHA-256 digests.
 *
 * Hashing first keeps the comparison constant-time even when the supplied token has a
 * different length from the real one — timingSafeEqual throws on length mismatch, and
 * that throw would itself leak the token's length.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * POST /api/admin/import
 *
 * Body: a JSON array of productions (see src/lib/import/schema.ts).
 * Header: x-admin-token: <ADMIN_IMPORT_TOKEN>
 *
 * This writes with the service-role key, which bypasses RLS. The token gate is the only
 * thing standing in front of that, so it fails closed: an unset ADMIN_IMPORT_TOKEN
 * disables the endpoint entirely rather than leaving it open.
 */
export async function POST(request: Request) {
  const expected = process.env.ADMIN_IMPORT_TOKEN;
  if (!expected || expected.trim() === "") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ADMIN_IMPORT_TOKEN is not set on the server. The import endpoint is disabled " +
          "until it is configured in .env.local.",
      },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-admin-token");
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  // Only the envelope is checked here. Each record is validated individually inside
  // runImport so that one bad entry in a 40-record batch does not reject the other 39.
  const envelope = ImportEnvelope.safeParse(body);
  if (!envelope.success) {
    return NextResponse.json(
      { ok: false, error: envelope.error.issues[0]?.message ?? "Invalid payload." },
      { status: 400 },
    );
  }

  let report;
  try {
    report = await runImport(createAdminClient(), envelope.data);
  } catch (cause) {
    // Reaching here means the failure was not record-scoped — bad credentials, an
    // unreachable database, a missing migration.
    return NextResponse.json(
      {
        ok: false,
        error: cause instanceof Error ? cause.message : "Import failed.",
      },
      { status: 500 },
    );
  }

  // 207 signals a partial import: some records landed, some are listed in `errors`.
  return NextResponse.json(report, { status: report.ok ? 200 : 207 });
}
