import "server-only";

/**
 * Service-role Supabase client for app code. SERVER ONLY.
 *
 * The implementation lives in ./service.ts so the seeding CLIs in `scripts/` can import it —
 * `server-only` throws on import outside a React Server Component, which kills a plain `tsx`
 * script. This file is the app-side door: same client, plus the build-time guard that turns
 * an accidental client-side import into an error rather than a leaked key.
 *
 * The key bypasses Row Level Security completely, which is exactly why /admin/import can
 * write production rows before any accounts exist. Never use it for a user-facing read path —
 * use ./server.ts, which respects RLS.
 */
export { createServiceClient as createAdminClient } from "./service";
