-- Data minimization: a check-in is just who + when. Appointment time and
-- practitioner live in Practice Better already — no need to copy them
-- into the log. Safe to re-run.

alter table public.checkins drop column if exists appointment_time;
alter table public.checkins drop column if exists practitioner;
