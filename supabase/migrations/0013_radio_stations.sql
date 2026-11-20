-- Staff's own radio stations for the waiting-room music (see
-- src/lib/music.ts). Idempotent: safe to paste into the Supabase SQL
-- editor more than once.
--
-- The built-in presets live in the code; this table holds only what staff
-- add in Dashboard → Waiting-room music → Radio. The station being played
-- is stored in waiting_room_music by address, not by reference, so
-- removing a station here never stops the music.

create table if not exists public.radio_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  -- One entry per stream.
  url text not null unique,
  created_at timestamptz not null default now(),
  created_by text
);

-- Service-role access only, same posture as the other tables
alter table public.radio_stations enable row level security;
