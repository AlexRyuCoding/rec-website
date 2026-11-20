-- Patient room flow: kiosk check-ins feed a waiting list on the rooms
-- board, staff assign each patient to a room, a paired waiting-room screen
-- calls the patient, and the room tile alerts the doctor.
--
-- One checkins row = one visit; the flow state lives on it as timestamps
-- (assigned -> called -> seen -> done), never as a status column, so every
-- device derives the same state. rooms gains a bed count (Room 5 = 2) and
-- a turnover marker: the check button now means "needles out" and the room
-- is only free again once staff tap "Room ready".
--
-- display_devices holds waiting-room screens paired by a staff-approved
-- code; the screen's secret is stored only as a sha256 hash.
-- Safe to re-run.

alter table public.rooms
  add column if not exists capacity int not null default 1
    check (capacity between 1 and 4);
alter table public.rooms
  add column if not exists turnover_started_at timestamptz;

alter table public.checkins
  add column if not exists practitioner_name text;
alter table public.checkins
  add column if not exists room_id uuid
    references public.rooms(id) on delete set null;
alter table public.checkins
  add column if not exists room_assigned_at timestamptz;
alter table public.checkins
  add column if not exists called_at timestamptz;
alter table public.checkins
  add column if not exists seen_at timestamptz;

-- done_at is added together with a one-time backfill that closes every
-- check-in logged before this migration, so the board's waiting list does
-- not open full of old visits. Guarded on the column's absence: re-running
-- the file later must never close visits that are in progress.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkins'
      and column_name = 'done_at'
  ) then
    alter table public.checkins add column done_at timestamptz;
    update public.checkins set done_at = checked_in_at;
  end if;
end
$$;

-- The board only ever reads open visits from the last few hours.
create index if not exists checkins_active_idx
  on public.checkins (checked_in_at)
  where done_at is null;

create table if not exists public.display_devices (
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

create index if not exists display_devices_code_idx
  on public.display_devices (code);

-- Service-role access only, same posture as the other tables
alter table public.display_devices enable row level security;
