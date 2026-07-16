-- Practice Better enforces one email per client for NEW records, but the
-- clinic's legacy bulk import (~94 records) contains family members who
-- genuinely share an email. Verified 2026-07-13: sampled colliding records
-- are different people (different names) with near-sequential import ids.
-- Email is therefore a contact point, not an identity: pb_client_id stays
-- the identity key, PINs stay unique per patient, and the setup-pin flow
-- refuses to guess between family members. Safe to re-run.

alter table public.patients drop constraint if exists patients_email_key;

-- Non-unique index keeps the setup-pin email lookup fast
create index if not exists patients_email_idx on public.patients (email);
