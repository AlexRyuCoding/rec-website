-- Tests for public.apply_flow_change (migration 0021). Run with: npm run test:db
-- One transaction, rolled back.

begin;

insert into public.patients (id, first_name, last_name, pb_client_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'Ann', 'A', 'afc-1'),
  ('00000000-0000-4000-8000-0000000000a2', 'Bob', 'B', 'afc-2'),
  ('00000000-0000-4000-8000-0000000000a3', 'Cy',  'C', 'afc-3');

insert into public.rooms (id, name, grid_row, grid_col, turnover_started_at)
values ('00000000-0000-4000-8000-00000000000f', 'Test room', 40, 0, now() - interval '2 minutes');

-- A couple in the room, and one patient lined up for it.
insert into public.checkins (id, patient_id, room_id, room_assigned_at, called_at, seen_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-00000000000f', now() - interval '40 minutes', now() - interval '40 minutes', now() - interval '38 minutes'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-00000000000f', now() - interval '40 minutes', now() - interval '40 minutes', now() - interval '38 minutes'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a3',
   '00000000-0000-4000-8000-00000000000f', now() - interval '5 minutes', null, null);

-- 1. All or nothing: "Room ready" where the last change cannot be made.
do $$
declare failed boolean := false;
begin
  begin
    perform public.apply_flow_change(
      '[
        {"id": "00000000-0000-4000-8000-0000000000c1", "fields": {"done_at": "2026-11-23T20:00:00Z"}},
        {"id": "00000000-0000-4000-8000-0000000000c2", "fields": {"done_at": "2026-11-23T20:00:00Z"}},
        {"id": "00000000-0000-4000-8000-0000000000ff", "fields": {"called_at": "2026-11-23T20:00:00Z"}}
      ]'::jsonb,
      '00000000-0000-4000-8000-00000000000f',
      '{"turnover_started_at": null}'::jsonb
    );
  exception when others then failed := true;
  end;
  assert failed, 'a visit that does not exist stops the change';
  assert (select count(*) from public.checkins
          where room_id = '00000000-0000-4000-8000-00000000000f' and done_at is not null) = 0,
    'neither of the couple was finished';
  assert (select turnover_started_at is not null from public.rooms
          where id = '00000000-0000-4000-8000-00000000000f'),
    'and the room is still setting up';
end $$;

-- 2. The same action, possible this time: everything lands together.
do $$
declare room jsonb;
begin
  room := public.apply_flow_change(
    '[
      {"id": "00000000-0000-4000-8000-0000000000c1", "fields": {"done_at": "2026-11-23T20:00:00Z"}},
      {"id": "00000000-0000-4000-8000-0000000000c2", "fields": {"done_at": "2026-11-23T20:00:00Z"}},
      {"id": "00000000-0000-4000-8000-0000000000c3", "fields": {"called_at": "2026-11-23T20:00:00Z"}}
    ]'::jsonb,
    '00000000-0000-4000-8000-00000000000f',
    '{"turnover_started_at": null}'::jsonb
  );
  assert room->>'name' = 'Test room', 'the room row comes back';
  assert room->>'turnover_started_at' is null, 'out of Setting Up';
  assert (select count(*) from public.checkins
          where id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2')
            and done_at = '2026-11-23T20:00:00Z') = 2, 'both of the couple are finished';
  assert (select called_at = '2026-11-23T20:00:00Z' from public.checkins
          where id = '00000000-0000-4000-8000-0000000000c3'), 'and the next patient is called';
end $$;

-- 3. A key that is present with null clears; an absent key is left alone.
do $$
declare v record;
begin
  perform public.apply_flow_change(
    '[{"id": "00000000-0000-4000-8000-0000000000c3",
       "fields": {"room_id": null, "room_assigned_at": null, "called_at": null}}]'::jsonb
  );
  select * into v from public.checkins where id = '00000000-0000-4000-8000-0000000000c3';
  assert v.room_id is null and v.room_assigned_at is null and v.called_at is null, 'nulls clear the columns';
  assert v.patient_id = '00000000-0000-4000-8000-0000000000a3', 'everything else is untouched';
end $$;

-- 4. Only the flow columns can be written through it.
do $$
declare v record;
begin
  perform public.apply_flow_change(
    '[{"id": "00000000-0000-4000-8000-0000000000c3",
       "fields": {"seen_at": "2026-11-23T21:00:00Z",
                  "patient_id": "00000000-0000-4000-8000-0000000000a1",
                  "service_name": "changed"}}]'::jsonb
  );
  select * into v from public.checkins where id = '00000000-0000-4000-8000-0000000000c3';
  assert v.seen_at = '2026-11-23T21:00:00Z', 'a flow column is written';
  assert v.patient_id = '00000000-0000-4000-8000-0000000000a3', 'the patient cannot be changed';
  assert v.service_name is null, 'nor the service';

  perform public.apply_flow_change(
    '[]'::jsonb, '00000000-0000-4000-8000-00000000000f',
    '{"timer_duration_seconds": 900, "name": "Renamed", "capacity": 4}'::jsonb
  );
  assert (select name = 'Test room' and capacity = 1 and timer_duration_seconds = 900
          from public.rooms where id = '00000000-0000-4000-8000-00000000000f'),
    'only timer columns of a room can be written';
end $$;

-- 5. A room that does not exist stops the change before any visit is touched.
do $$
declare failed boolean := false;
begin
  begin
    perform public.apply_flow_change(
      '[{"id": "00000000-0000-4000-8000-0000000000c3", "fields": {"seen_at": null}}]'::jsonb,
      '00000000-0000-4000-8000-0000000000ee', '{"turnover_started_at": null}'::jsonb
    );
  exception when others then failed := true;
  end;
  assert failed, 'an unknown room is refused';
  assert (select seen_at is not null from public.checkins
          where id = '00000000-0000-4000-8000-0000000000c3'), 'and the visit was not changed';
end $$;

-- 6. Privacy: another role changes nothing through it (row-level security).
create role flow_test_outsider;
grant usage on schema public to flow_test_outsider;
grant select, update on public.checkins, public.rooms to flow_test_outsider;
grant execute on function public.apply_flow_change(jsonb, uuid, jsonb) to flow_test_outsider;
set local role flow_test_outsider;
do $$
declare failed boolean := false;
begin
  begin
    perform public.apply_flow_change(
      '[{"id": "00000000-0000-4000-8000-0000000000c1", "fields": {"done_at": null}}]'::jsonb
    );
  exception when others then failed := true;
  end;
  assert failed, 'for another role the visit does not exist';
end $$;
reset role;
do $$
begin
  assert (select done_at is not null from public.checkins
          where id = '00000000-0000-4000-8000-0000000000c1'), 'the visit is as it was';
end $$;

rollback;
