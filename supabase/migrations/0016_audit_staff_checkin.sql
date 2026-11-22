-- Staff can now check a patient in from the dashboard (a walk-in, a
-- forgotten PIN, the kiosk being down). That goes in the staff audit log
-- too, as a third action: 'staff_checkin'.
--
-- Apply AFTER 0015 (it changes the table 0015 creates). Safe to re-run.
-- Until this is applied a staff check-in still works; only its audit row
-- is refused and the app logs "audit log write failed".

alter table if exists public.staff_audit_log
  drop constraint if exists staff_audit_log_action_check;

alter table if exists public.staff_audit_log
  add constraint staff_audit_log_action_check
  check (action in ('patient_search', 'pin_reset', 'staff_checkin'));
