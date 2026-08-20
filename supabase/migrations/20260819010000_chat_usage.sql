-- Live Grid — chat metering
--
-- /api/chat is the first endpoint in this product that spends money per request, and there is
-- no rate limiting anywhere else in the app. An unmetered LLM endpoint behind a public page
-- is a billing incident waiting for someone to find it.
--
-- Keyed on a SALTED HASH of the caller's IP, never the address itself. The counter only needs
-- to distinguish callers from each other, not identify them, and storing raw addresses would
-- turn a usage table into a log of who read what.
--
-- Postgres rather than an in-memory counter because the route runs on serverless instances
-- that neither share memory nor persist between invocations.

create table public.chat_usage (
  day      date not null default (now() at time zone 'utc')::date,
  ip_hash  text not null,
  count    integer not null default 0,
  primary key (day, ip_hash)
);

create index chat_usage_day_idx on public.chat_usage (day);

comment on table public.chat_usage is
  'Per-day request counts for /api/chat, keyed on a salted hash of the caller IP.';

-- Atomic increment-and-read. Doing this as select-then-update would race between two
-- concurrent requests from the same caller and undercount, which is the wrong direction for
-- a spend limit to be wrong in.
create function public.bump_chat_usage(p_ip_hash text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.chat_usage (day, ip_hash, count)
  values ((now() at time zone 'utc')::date, p_ip_hash, 1)
  on conflict (day, ip_hash)
    do update set count = public.chat_usage.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Unlike every other table here this one is NOT world-readable: it is operational
-- data about visitors, not content. Only the service-role key (which bypasses RLS) touches
-- it, so no policy grants anon or authenticated anything.
-- ---------------------------------------------------------------------------
alter table public.chat_usage enable row level security;

revoke all on public.chat_usage from anon, authenticated;
revoke all on function public.bump_chat_usage(text) from anon, authenticated;
