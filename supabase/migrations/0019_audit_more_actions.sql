-- The staff audit log covers more of what staff do with patient data, and
-- can be read on the dashboard (Log tab) instead of in the table editor.
--
-- New actions:
--   checkins_view    the check-in history was shown (which patients were
--                    listed, for which dates)
--   checkins_export  it was exported as a CSV file
--   visit_remove     a patient was taken off the rooms board
--   visit_restore    a finished patient was put back on it
--   device_pair      a waiting-room screen or check-in kiosk was paired
--   device_revoke    one was revoked
--
-- Apply AFTER 0015 and 0016 (it changes the table they shape). Safe to
-- re-run. Until this is applied those six things still work; only their
-- audit rows are refused, and the app logs "audit log write failed".

alter table if exists public.staff_audit_log
  drop constraint if exists staff_audit_log_action_check;

alter table if exists public.staff_audit_log
  add constraint staff_audit_log_action_check
  check (action in (
    'patient_search',
    'pin_reset',
    'staff_checkin',
    'checkins_view',
    'checkins_export',
    'visit_remove',
    'visit_restore',
    'device_pair',
    'device_revoke'
  ));

-- "Everything involving this patient" is the question the log exists to
-- answer; this makes it an index lookup.
create index if not exists staff_audit_log_patient_ids_idx
  on public.staff_audit_log using gin (patient_ids);
