-- The staff audit log also records who signed in. Until now it held what
-- staff did with patient information, but not that someone signed in —
-- or that someone who is not staff tried to.
--
-- New actions (none of them names a patient; patient_ids stays empty):
--   staff_signin     a staff member signed in with Google
--   staff_signout    a staff member pressed Sign out on the dashboard
--   signin_refused   a Google account that is not on the staff list tried
--                    to sign in and was refused. staff_email then holds
--                    the address that tried — it is not a staff member's.
--
-- Apply AFTER 0015, 0016 and 0019 (it changes the table they shape). Safe
-- to re-run. It adds no table, column or function: only three more values
-- the existing `action` column accepts, so it needs no grants and nothing
-- for PostgREST to re-read.
--
-- Until this is applied signing in and out work exactly as before; only
-- their audit rows are refused (23514), and the app logs
-- "audit log write failed".

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
    'device_revoke',
    'staff_signin',
    'staff_signout',
    'signin_refused'
  ));
