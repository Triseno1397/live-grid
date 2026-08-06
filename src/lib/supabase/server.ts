import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/**
 * Anon-key Supabase client for server components and public route handlers.
 *
 * Every public read in the app goes through this — it is bound by RLS, so it can only
 * ever see what an anonymous visitor is allowed to see. Phase 1 pages and the future
 * public API both consume this same client (AGENTS.md rule 3: API-first).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: session refresh is handled in middleware once auth
          // lands in Phase 2.
        }
      },
    },
  });
}
