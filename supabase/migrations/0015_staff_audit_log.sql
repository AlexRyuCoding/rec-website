-- A record of what staff do with patient data from the dashboard: every
-- patient search (whose details were listed) and every PIN reset.
-- Written by src/lib/audit-server.ts; read it in the Supabase table
-- editor. Safe to re-run.
--
-- Until this is applied the dashboard works as before and the app logs
-- "audit log write failed" — nothing is recorded.

create table if not exists public.staff_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- the staff member's Google account
  staff_email text not null,
  action text not null check (action in ('patient_search', 'pin_reset')),
  -- the patients whose details were shown (search) or changed (reset).
  -- Deliberately not a foreign key: the record must outlive the patient.
  patient_ids uuid[] not null default '{}',
  -- for a search: the text that was typed
  detail text
);

create index if not exists staff_audit_log_at_idx
  on public.staff_audit_log (at desc);

-- RLS on with no policies: only the service-role key can touch it.
alter table public.staff_audit_log enable row level security;
