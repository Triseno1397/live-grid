import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { serviceSupabaseEnv } from "./env";

/**
 * Service-role Supabase client. SERVER AND SCRIPTS ONLY.
 *
 * This is the same client `./admin.ts` exports, minus the `import "server-only"` marker —
 * and that omission is the entire reason the file exists.
 *
 * `server-only`'s package body is a bare `throw`; only the `react-server` export condition
 * resolves to the empty file. That is exactly what makes it a good guard for app code and
 * exactly what makes it fatal for a `tsx` script, which resolves the throwing entrypoint and
 * dies on import. The seeding CLIs in `scripts/` need service-role writes, so they import
 * here; `./admin.ts` re-exports this and keeps the guard for everything under `src/app`.
 *
 * **Do not import this from anywhere under `src/` other than `./admin.ts`.** An
 * `no-restricted-imports` rule in `eslint.config.mjs` enforces that, because the guard this
 * file drops is the one that would otherwise turn a client-component import into a build
 * error instead of a leaked key.
 *
 * Never use this for a user-facing read path — use ./server.ts, which respects RLS.
 */
export function createServiceClient() {
  const { url, serviceRoleKey } = serviceSupabaseEnv();

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
