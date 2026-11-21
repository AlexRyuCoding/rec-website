-- Staff patient search (Dashboard → Patients) as one database function.
-- Safe to re-run.
--
-- The route used to build a filter out of the typed text and rank the
-- first 200 rows itself. Here the text arrives as plain parameters (no
-- wildcards, nothing to strip), every patient is ranked before the list
-- is cut, and two things the old search could not do are added:
--   - accents are ignored: "Jose" finds "José" (unaccent)
--   - close spellings are found: "Licatr" finds "Licater" (pg_trgm)
--
-- The words are split in src/lib/patient-search.ts; this function decides
-- who matches and in what order. Tests: supabase/tests/patient_search.sql
-- (npm run test:db).

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- EVERY word must match the patient: inside the first name, the last
-- name or the email, or (4+ letters) as a close spelling of a name.
-- Best matches first; each word scores
--   4  a whole name, or a whole part of one ("Mary Ann", "Jones-Smith")
--   3  the start of a name or part
--   2  somewhere inside a name
--   1.5–2  a close spelling of a name (word_similarity >= 0.5)
--   1  only in the email
-- search_phones, when given, is used instead of the words: any of the
-- digit strings inside the stored phone number.
--
-- Returns has_pin, never the PIN hash. total_matches is how many patients
-- matched before max_results cut the list.
--
-- SECURITY INVOKER (the default) on purpose — do not change it to
-- definer. Row-level security on patients has no policies, so this
-- returns rows only to the service role; a definer function would hand
-- the patient list to anyone holding the public anon key.
create or replace function public.search_patients(
  search_words text[] default '{}',
  search_phones text[] default '{}',
  max_results int default 20
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  has_pin boolean,
  total_matches bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with words as (
    select distinct lower(unaccent(btrim(w))) as word
    from unnest(coalesce(search_words, '{}')) as w
    where btrim(w) <> ''
  ),
  phones as (
    select distinct d as digits
    from unnest(coalesce(search_phones, '{}')) as d
    where d <> ''
  ),
  normalized as (
    select
      p.id, p.first_name, p.last_name, p.email, p.phone,
      p.pin is not null as has_pin,
      coalesce(p.phone_digits, '') as phone_digits,
      lower(unaccent(btrim(p.first_name))) as first_n,
      lower(unaccent(btrim(p.last_name))) as last_n,
      lower(coalesce(p.email, '')) as email_n
    from public.patients p
  ),
  candidates as (
    select
      n.*,
      -- the two names, plus each part of "mary ann" / "jones-smith" / "o'brien"
      array[n.first_n, n.last_n]
        || regexp_split_to_array(n.first_n || ' ' || n.last_n, '[\s''-]+') as name_parts
    from normalized n
  ),
  scored as (
    select c.*, t.words_matched, t.score
    from candidates c
    cross join lateral (
      select
        count(*) filter (where s.score > 0) as words_matched,
        coalesce(sum(s.score), 0) as score
      from words w
      cross join lateral (
        select case
          when w.word = any (c.name_parts) then 4
          when exists (
            select 1 from unnest(c.name_parts) as part
            where starts_with(part, w.word)
          ) then 3
          when strpos(c.first_n, w.word) > 0
            or strpos(c.last_n, w.word) > 0 then 2
          when length(w.word) >= 4 and greatest(
            word_similarity(w.word, c.first_n),
            word_similarity(w.word, c.last_n)
          ) >= 0.5 then 1 + greatest(
            word_similarity(w.word, c.first_n),
            word_similarity(w.word, c.last_n)
          )
          when strpos(c.email_n, w.word) > 0 then 1
          else 0
        end::numeric as score
      ) s
    ) t
  ),
  matched as (
    select s.*
    from scored s
    where case
      when exists (select 1 from phones) then exists (
        select 1 from phones ph where strpos(s.phone_digits, ph.digits) > 0
      )
      else exists (select 1 from words)
        and s.words_matched = (select count(*) from words)
    end
  )
  select
    m.id, m.first_name, m.last_name, m.email, m.phone, m.has_pin,
    count(*) over () as total_matches
  from matched m
  order by
    case when exists (select 1 from phones) then 0 else m.score end desc,
    m.last_n, m.first_n, m.id
  limit least(greatest(coalesce(max_results, 20), 1), 100);
$$;

-- Staff search goes through the service-role key only. Row-level security
-- already returns nothing to anyone else; this also takes the function
-- away from the public API roles. (The roles exist on Supabase, not on a
-- plain local Postgres.)
revoke execute on function public.search_patients(text[], text[], int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function public.search_patients(text[], text[], int)
      from anon, authenticated;
    grant execute on function public.search_patients(text[], text[], int)
      to service_role;
  end if;
end $$;

-- Tell the API layer the function exists now (harmless elsewhere).
notify pgrst, 'reload schema';
