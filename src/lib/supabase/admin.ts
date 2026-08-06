import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { serviceSupabaseEnv } from "./env";

/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * This key bypasses Row Level Security completely, which is exactly why /admin/import can
 * write production rows before any accounts exist. The `import "server-only"` above turns
 * any accidental client-side import into a build error rather than a leaked key.
 *
 * Never use this for a user-facing read path — use ./server.ts, which respects RLS.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = serviceSupabaseEnv();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
