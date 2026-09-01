-- Doctor roster for the room timer board (/admin/rooms). Staff manage a
-- short list of doctor names (max 5, enforced in the API) in the layout
-- editor; a room shows at most one assigned doctor. Assignment is stored
-- denormalized as rooms.doctor_name so the room row stays flat for
-- broadcasts and optimistic updates — deleting a doctor from the roster
-- also clears the name off any rooms holding it (done in the API).
-- Replaces the old free-text practitioner_name field.
-- Safe to re-run.

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Service-role access only, same posture as the other tables
alter table public.doctors enable row level security;

alter table public.rooms drop column if exists practitioner_name;
alter table public.rooms add column if not exists doctor_name text;
