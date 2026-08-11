import { NextResponse } from "next/server";

import { searchAll } from "@/lib/queries/search";

/**
 * GET /api/search?q=...
 *
 * The Cmd-K palette's only data source, and the shape a public search API would expose
 * (AGENTS.md rule 3) — the palette holds no query logic of its own, so a future API
 * consumer and the palette can never drift apart.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const hits = await searchAll(query);
    return NextResponse.json(
      { hits },
      {
        // Repeat searches for the same term are common while typing; a short shared cache
        // absorbs them without ever serving a stale production page.
        headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
      },
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Search failed.";
    return NextResponse.json({ hits: [], error: message }, { status: 500 });
  }
}
