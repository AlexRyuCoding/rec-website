-- Durable store for failed PIN lookups so brute-force limiting survives
-- serverless cold starts and applies across instances.
-- Safe to re-run: everything is IF NOT EXISTS.

create table if not exists public.pin_attempt_failures (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now()
);

create index if not exists pin_attempt_failures_attempted_at_idx
  on public.pin_attempt_failures (attempted_at);

-- RLS on with no policies: only the service-role key can touch this.
alter table public.pin_attempt_failures enable row level security;
