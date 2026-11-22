-- Today's Practice Better appointments, kept for a few minutes at a time,
-- for the rooms board's "Expected" list (who has not arrived yet).
--
-- Why a table: Practice Better allows 10,000 API requests a day for
-- everything the clinic does with it. If every tablet asked for the
-- schedule itself, a few boards left open would use a large part of
-- that. So the day's schedule is fetched once, stored here, and shared:
-- any board asking within five minutes reads this row instead.
--
-- One row per clinic day; yesterday's is deleted when today's is written.
-- `sessions` is a list of {pbClientId, at, practitioner, service} — no
-- names: the patient is found in `patients` by their Practice Better id.
--
-- Safe to re-run. Until this is applied the Expected list says it is not
-- available; nothing else is affected.

create table if not exists public.day_schedule_cache (
  day date primary key,
  fetched_at timestamptz not null default now(),
  -- false if Practice Better had more sessions than could be read
  complete boolean not null default true,
  sessions jsonb not null default '[]'::jsonb
);

-- Service-role access only, same posture as the other tables
alter table public.day_schedule_cache enable row level security;
