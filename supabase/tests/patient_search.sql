-- Tests for public.search_patients (migration 0014). Plain SQL: every
-- "assert" stops the run on failure. Run with: npm run test:db
-- Everything happens in one transaction that is rolled back.

begin;

insert into public.patients (first_name, last_name, email, phone, pin, pb_client_id) values
  ('Ann',      'Licater',     'al@example.com',   '(415) 555-1234',  'hash', 't1'),
  ('Joanne',   'Abel',        'jabel@gmail.com',  '+1 415 555 9999', null,   't2'),
  ('Hannah',   'Baker',       'hb@gmail.com',     null,              null,   't3'),
  ('Anna',     'Lopez',       null,               null,              null,   't4'),
  ('Bob',      'Stone',       'link@example.com', null,              null,   't5'),
  ('José',     'Muñoz',       null,               null,              null,   't6'),
  ('Mary Ann', 'Jones-Smith', null,               null,              null,   't7'),
  ('Amy',      'Ansmith',     'a_b@example.com',  null,              null,   't8'),
  ('Michael',  'Brown',       null,               null,              null,   't9'),
  ('Pat',      'O''Brien',    null,               null,              null,   't10'),
  ('  Zoë ',   ' Brontë  ',   null,               null,              null,   't11'),
  ('Sue',      'Licator',     null,               null,              null,   't12');

-- The names a search returns, in order: "Ann Licater, Anna Lopez".
create function pg_temp.found(variadic words text[]) returns text
language sql as $$
  select coalesce(string_agg(btrim(first_name) || ' ' || btrim(last_name), ', '), '')
  from public.search_patients(search_words => words)
$$;

create function pg_temp.found_phone(variadic phones text[]) returns text
language sql as $$
  select coalesce(string_agg(btrim(first_name) || ' ' || btrim(last_name), ', '), '')
  from public.search_patients(search_phones => phones)
$$;

create function pg_temp.is(got text, want text, what text) returns void
language plpgsql as $$
begin
  assert got is not distinct from want,
    format('%s: got [%s], wanted [%s]', what, got, want);
end $$;

-- The bug this replaces: first name + part of the last name.
select pg_temp.is(pg_temp.found('ann', 'lic'), 'Ann Licater', 'first name + part of last name');
select pg_temp.is(pg_temp.found('lic', 'ann'), 'Ann Licater', 'last name typed first');
select pg_temp.is(pg_temp.found('ANN', 'Lic'), 'Ann Licater', 'capital letters');

-- Ranking: whole name > start of a name > inside a name > email only.
select pg_temp.is(pg_temp.found('ann', 'l'),
  'Ann Licater, Anna Lopez, Joanne Abel, Hannah Baker', 'closest names first');
select pg_temp.is(pg_temp.found('smith'),
  'Mary Ann Jones-Smith, Amy Ansmith', 'second half of a two-part name counts as a start');
select pg_temp.is(pg_temp.found('mary', 'smith'), 'Mary Ann Jones-Smith', 'two-part names');

-- Accents, either way round, and stray spaces in the stored name.
select pg_temp.is(pg_temp.found('jose'), 'José Muñoz', 'typed without the accent');
select pg_temp.is(pg_temp.found('munoz', 'josé'), 'José Muñoz', 'typed with the accent');
select pg_temp.is(pg_temp.found('zoe', 'bronte'), 'Zoë Brontë', 'accents + stored spaces');

-- Typos: close spellings are found, after the exact ones.
select pg_temp.is(pg_temp.found('licatr'), 'Ann Licater, Sue Licator', 'a missing letter');
select pg_temp.is(pg_temp.found('lickater'), 'Ann Licater', 'an extra letter');
select pg_temp.is(pg_temp.found('micheal'), 'Michael Brown', 'swapped letters');
select pg_temp.is(pg_temp.found('obrien'), 'Pat O''Brien', 'apostrophe left out');
select pg_temp.is(pg_temp.found('licater'), 'Ann Licater, Sue Licator', 'exact spelling before the close one');
select pg_temp.is(pg_temp.found('licator'), 'Sue Licator, Ann Licater', 'and the other way round');
select pg_temp.is(pg_temp.found('ann', 'licatr'), 'Ann Licater', 'a typo next to an exact word');

-- Not everything is "close": "link" is not Licater. It is in Bob's email.
select pg_temp.is(pg_temp.found('link'), 'Bob Stone', 'a different word is not a typo');
select pg_temp.is(pg_temp.found('ann', 'zzzz'), '', 'every word has to match');

-- Typed text is plain text: no wildcards.
select pg_temp.is(pg_temp.found('%'), '', 'percent is not a wildcard');
select pg_temp.is(pg_temp.found('a_b'), 'Amy Ansmith', 'underscore matches itself');
select pg_temp.is(pg_temp.found('a_m'), '', 'underscore is not a wildcard');
select pg_temp.is(pg_temp.found('o''brien'), 'Pat O''Brien', 'apostrophe');

-- Phone numbers: any of the forms, stored with or without the 1.
select pg_temp.is(pg_temp.found_phone('14155551234', '4155551234'), 'Ann Licater', 'typed with the country code');
select pg_temp.is(pg_temp.found_phone('4155559999'), 'Joanne Abel', 'stored with the country code');
select pg_temp.is(pg_temp.found_phone('5550000'), '', 'unknown phone');

-- Nothing asked, nothing returned.
select pg_temp.is(pg_temp.found(variadic '{}'::text[]), '', 'no words');
select pg_temp.is(pg_temp.found('', '  '), '', 'blank words');

-- has_pin is reported; the hash is not a column of the result at all.
do $$
begin
  assert (select has_pin from public.search_patients(array['licater']) limit 1),
    'Ann has a PIN';
  assert not (select has_pin from public.search_patients(array['lopez']) limit 1),
    'Anna has no PIN';
  assert (
    select pg_get_function_result(p.oid) from pg_proc p
    where p.proname = 'search_patients' and p.pronamespace = 'public'::regnamespace
  ) not like '%pin text%', 'the PIN hash is not returned';
end $$;

-- max_results cuts the list; total_matches says how many there were.
do $$
declare shown int; total bigint;
begin
  select count(*), max(total_matches) into shown, total
  from public.search_patients(array['a'], max_results => 2);
  assert shown = 2, format('max_results: got %s rows', shown);
  assert total > 2, format('total_matches: got %s', total);
end $$;

-- Privacy: the function runs as the caller, so row-level security still
-- applies. A role that is not the service role gets nothing, even with
-- every grant (which is what Supabase gives the public "anon" role).
create role search_test_outsider;
grant usage on schema public, extensions to search_test_outsider;
grant select on public.patients to search_test_outsider;
grant execute on function public.search_patients(text[], text[], int) to search_test_outsider;
set local role search_test_outsider;
select pg_temp.is(
  (select count(*)::text from public.search_patients(array['ann'])),
  '0', 'row-level security hides patients from other roles');
reset role;

rollback;
