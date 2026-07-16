-- Normalized phone column so the kiosk can look up by phone with an exact
-- indexed query. The previous approach fetched the whole patients table and
-- filtered in JS — PostgREST silently caps that at 1,000 rows, which made
-- ~4,450 of 5,450 patients invisible to phone lookup. Safe to re-run.

alter table public.patients add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) stored;

create index if not exists patients_phone_digits_idx
  on public.patients (phone_digits);
