-- Clinic room timer board (/admin/rooms). Each row is a tile placed on a
-- grid (grid_row, grid_col). A running timer is stored as timestamps plus a
-- duration — status (Available / In Use / Complete / Overtime) is derived
-- from these at read time, never ticked server-side. Pausing sets
-- timer_paused_at; resuming rewrites timer_started_at so elapsed time is
-- preserved. All three timer_* columns null = room Available.
-- Safe to re-run.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grid_row int not null check (grid_row >= 0),
  grid_col int not null check (grid_col >= 0),
  practitioner_name text,
  default_duration_seconds int not null default 900,
  timer_started_at timestamptz,
  timer_duration_seconds int,
  timer_paused_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (grid_row, grid_col)
);

-- Service-role access only, same posture as patients/checkins
alter table public.rooms enable row level security;
