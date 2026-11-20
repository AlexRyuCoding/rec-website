-- Background music for the waiting-room TV (see src/lib/music.ts).
-- Idempotent: safe to paste into the Supabase SQL editor more than once.
--
-- One row, ever: what staff chose in Dashboard → Waiting-room music, plus
-- the clinic's Spotify connection. The links are kept for every source,
-- not only the active one, so switching back does not mean pasting again.

create table if not exists public.waiting_room_music (
  -- A boolean primary key that can only be true = at most one row.
  id boolean primary key default true check (id),
  source text not null default 'off'
    check (source in ('off', 'radio', 'youtube', 'spotify')),
  radio_name text,
  radio_url text,
  youtube_url text,
  spotify_url text,
  volume integer not null default 60 check (volume between 0 and 100),
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  -- Spotify's long-lived refresh token, encrypted by the app (AES-256-GCM,
  -- key derived from NEXTAUTH_SECRET) — never stored readable.
  spotify_refresh_token text,
  spotify_account_name text,
  spotify_connected_at timestamptz
);

insert into public.waiting_room_music (id)
values (true)
on conflict (id) do nothing;

-- Service-role access only, same posture as the other tables
alter table public.waiting_room_music enable row level security;
