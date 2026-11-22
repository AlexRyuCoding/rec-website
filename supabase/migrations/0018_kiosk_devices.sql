-- Check-in kiosks paired as devices, the way the waiting-room TV is
-- (display_devices, migration 0011): the tablet shows a code, a signed-in
-- staff member types it into Dashboard → Screens, and from then on the
-- tablet's cookie opens the kiosk's routes — and only those — until staff
-- revoke it. The tablet no longer needs a staff sign-in, so it no longer
-- is a signed-in staff browser left in the waiting room.
--
-- Its own table, not a "kind" column on display_devices: a TV pairing
-- must never open the kiosk's routes (PIN lookup, PIN setup, check-in),
-- and this way it cannot — the two kinds are looked up in different
-- places. The secret is stored only as a sha256 hash.
--
-- Safe to re-run. Until this is applied the kiosk works as before, on a
-- staff sign-in; "Show pairing code" on the tablet just fails.

create table if not exists public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  secret_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  created_ip text,
  approved_at timestamptz,
  approved_by text,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists kiosk_devices_code_idx
  on public.kiosk_devices (code);

-- Service-role access only, same posture as the other tables
alter table public.kiosk_devices enable row level security;
