-- Finding a patient by PIN in one query.
--
-- A PIN is stored as a bcrypt hash, which cannot be searched: signing in
-- at the kiosk meant comparing the PIN typed against every patient's hash
-- in turn, slower with every patient who makes a PIN. pin_lookup holds a
-- fingerprint of the PIN (an HMAC under a key only the server has — see
-- src/lib/pin-lookup.ts) that CAN be searched. The bcrypt hash stays and
-- is still what a match is confirmed against.
--
-- Nothing is filled in here: a fingerprint needs the PIN, which is not
-- stored. Each patient gets theirs the next time they sign in (found the
-- old way once, then stamped). Safe to re-run. Until this is applied the
-- kiosk keeps working the old way.

alter table public.patients
  add column if not exists pin_lookup text;

-- One patient per PIN, now also guaranteed by the database (two patients
-- choosing the same PIN at the same moment could both pass the app's
-- check).
create unique index if not exists patients_pin_lookup_key
  on public.patients (pin_lookup)
  where pin_lookup is not null;

-- A fingerprint describes one particular PIN. Whenever the PIN changes
-- and the same statement does not supply a new fingerprint — a staff
-- "Reset PIN" (pin := null), or any code that predates this column — the
-- old one is cleared here, so it can never point at a PIN that is gone or
-- block another patient from choosing that number.
create or replace function public.clear_stale_pin_lookup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pin is distinct from old.pin
     and new.pin_lookup is not distinct from old.pin_lookup then
    new.pin_lookup := null;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_clear_stale_pin_lookup on public.patients;
create trigger patients_clear_stale_pin_lookup
  before update on public.patients
  for each row execute function public.clear_stale_pin_lookup();
