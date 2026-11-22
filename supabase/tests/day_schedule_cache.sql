-- Tests for public.day_schedule_cache (migration 0020). Run with: npm run test:db
-- One transaction, rolled back.

begin;

insert into public.day_schedule_cache (day, sessions)
values ('2026-11-23', '[{"pbClientId":"pb-1","at":"2026-11-23T18:30:00.000Z","practitioner":"Alex Ryu","service":"Acupuncture"}]');

do $$
declare ok boolean := false; r record;
begin
  select * into r from public.day_schedule_cache where day = '2026-11-23';
  assert r.complete, 'a schedule is complete unless said otherwise';
  assert jsonb_array_length(r.sessions) = 1, 'the sessions are kept as a list';
  assert r.fetched_at > now() - interval '1 minute', 'with the time it was fetched';

  -- one row per day: fetching again replaces it
  begin
    insert into public.day_schedule_cache (day, sessions) values ('2026-11-23', '[]');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'a day has one row';
  insert into public.day_schedule_cache (day, sessions) values ('2026-11-23', '[]')
    on conflict (day) do update set sessions = excluded.sessions, fetched_at = now();
  assert (select jsonb_array_length(sessions) from public.day_schedule_cache where day = '2026-11-23') = 0,
    'an upsert replaces the day';
end $$;

-- Privacy: row-level security with no policies.
create role schedule_test_outsider;
grant usage on schema public to schedule_test_outsider;
grant select, insert, update, delete on public.day_schedule_cache to schedule_test_outsider;
set local role schedule_test_outsider;
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.day_schedule_cache;
  assert n = 0, format('another role reads nothing: got %s', n);
  begin
    insert into public.day_schedule_cache (day) values ('2026-11-24');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'another role cannot write';
end $$;
reset role;

rollback;
