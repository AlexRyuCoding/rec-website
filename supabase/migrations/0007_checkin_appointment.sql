-- Log the appointment alongside the check-in: appointment date/time and
-- service name are fetched live from Practice Better at check-in time and
-- stored on the row so the dashboard log shows what the visit was for.
-- Both are nullable — a check-in still logs if PB is unreachable or the
-- patient has no session today. Safe to re-run.

alter table public.checkins
  add column if not exists appointment_at timestamptz,
  add column if not exists service_name text;
