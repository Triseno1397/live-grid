import { NextResponse } from "next/server";

import { getSeedStats } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Seeding changes rows constantly; a cached count would be actively misleading.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats — seeding progress.
 *
 * No token gate: this reads the anon client and returns only publicly readable content,
 * the same rows /browse will serve in Phase 1. It writes nothing.
 */
export async function GET() {
  try {
    return NextResponse.json(await getSeedStats(await createClient()));
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to read stats." },
      { status: 500 },
    );
  }
}
