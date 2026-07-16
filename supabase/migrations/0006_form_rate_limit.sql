-- Durable per-IP rate limiting for the public email-sending forms
-- (request-form, grievance-form). Mirrors 0002_pin_attempt_limit.sql.
-- Idempotent — safe to paste into the Supabase SQL editor.

create table if not exists public.form_submission_events (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  submitted_at timestamptz not null default now()
);

create index if not exists form_submission_events_ip_time_idx
  on public.form_submission_events (ip, submitted_at);

-- RLS on with no policies: only the service-role key can touch it.
alter table public.form_submission_events enable row level security;
