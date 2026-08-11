import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/**
 * Anonymous read-only client for public Phase 1 pages.
 *
 * Distinct from `./server`, which binds Supabase to the request's cookies for the auth
 * session Phase 2 will add. Reading cookies opts a route out of static rendering entirely,
 * and every public page here is anonymous content — there is no session to carry. Using a
 * sessionless client instead lets those pages render as ISR and hit the Vercel cache.
 *
 * Still the anon key, so still bound by RLS: this can only ever see public content.
 */
export function createPublicClient() {
  const { url, anonKey } = publicSupabaseEnv();

  return createSupabaseClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
