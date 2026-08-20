-- Live Grid — close public EXECUTE on bump_chat_usage
--
-- 20260819010000 revoked the function from `anon, authenticated` and that was not enough.
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and revoking from two
-- roles that are merely MEMBERS of public leaves the public grant standing. Verified against
-- the live database: a call carrying only the anon key (which ships in the browser bundle and
-- is not a secret) returned 200 and incremented the counter.
--
-- That is a SECURITY DEFINER write primitive exposed to anonymous callers. The damage is not
-- reading anything -- the table is correctly unreadable -- it is unbounded INSERT: any caller
-- could invent ip_hash values and grow the table without limit, and could burn a real user's
-- daily quota by guessing their hash.
--
-- Only the service-role key needs this function, and service_role bypasses RLS and privilege
-- checks anyway, so revoking from PUBLIC costs the application nothing.

revoke all on function public.bump_chat_usage(text) from public;
revoke all on function public.bump_chat_usage(text) from anon, authenticated;

-- Same reasoning for the table itself. Its grants were never issued, but stating it here
-- keeps the intent in one place rather than split across two migrations.
revoke all on table public.chat_usage from public;
revoke all on table public.chat_usage from anon, authenticated;
