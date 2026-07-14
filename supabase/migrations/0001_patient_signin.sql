-- Patient sign-in schema — apply in the Supabase SQL editor (or via psql).
-- Safe to re-run: everything is IF NOT EXISTS.

create extension if not exists pgcrypto;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text unique,
  phone text,
  -- bcrypt hash, null until the patient sets a PIN at the kiosk
  pin text,
  -- Practice Better client record id; sync + webhook upsert on this
  pb_client_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  appointment_time text,
  practitioner text
);

create index if not exists checkins_patient_id_idx
  on public.checkins (patient_id);

create index if not exists checkins_checked_in_at_idx
  on public.checkins (checked_in_at);

-- RLS on with no policies: the anon/publishable key can read nothing.
-- All app access goes through the service-role key, which bypasses RLS.
alter table public.patients enable row level security;
alter table public.checkins enable row level security;
