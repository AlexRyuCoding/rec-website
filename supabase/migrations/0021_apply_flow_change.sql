-- One rooms-board action, written all at once.
--
-- Some actions change several rows: "Room ready" on a room with a couple
-- and someone lined up finishes two visits, calls a third, and takes the
-- room out of Setting Up. The app used to send those as separate writes,
-- one after another, so a connection dropped in between left the board
-- half-changed — one of the couple finished and the other not, or a room
-- marked ready with its patients still in it.
--
-- apply_flow_change does a whole action in a single transaction: every
-- row changes, or none does. The app still decides WHAT changes (the
-- rules are in src/lib/patient-flow.ts and room-status.ts); this only
-- writes it.
--
--   visit_updates  [{"id": "<checkin uuid>", "fields": {...}}, ...]
--                  only room_id, room_assigned_at, called_at, seen_at and
--                  done_at are written; any other key is ignored. A key
--                  that is present with null clears the column; a key
--                  that is absent leaves it alone.
--   target_room    the room to change as well, or null
--   room_fields    only the timer columns, turnover_started_at and
--                  default_duration_seconds are written
--
-- Returns the room row after the change (null if no room was given). A
-- visit or room that does not exist stops everything: nothing is written.
--
-- SECURITY INVOKER on purpose, like search_patients: row-level security
-- (no policies) is what keeps it powerless for the anon key. Never make
-- it security definer.
--
-- Safe to re-run. Until this is applied the app writes row by row as
-- before (it falls back only when the function does not exist).

create or replace function public.apply_flow_change(
  visit_updates jsonb default '[]'::jsonb,
  target_room uuid default null,
  room_fields jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  u jsonb;
  f jsonb;
  room_after jsonb := null;
begin
  if target_room is not null and room_fields is not null then
    update public.rooms r set
      timer_started_at = case when room_fields ? 'timer_started_at'
        then (room_fields->>'timer_started_at')::timestamptz
        else r.timer_started_at end,
      timer_duration_seconds = case when room_fields ? 'timer_duration_seconds'
        then (room_fields->>'timer_duration_seconds')::int
        else r.timer_duration_seconds end,
      timer_paused_at = case when room_fields ? 'timer_paused_at'
        then (room_fields->>'timer_paused_at')::timestamptz
        else r.timer_paused_at end,
      turnover_started_at = case when room_fields ? 'turnover_started_at'
        then (room_fields->>'turnover_started_at')::timestamptz
        else r.turnover_started_at end,
      default_duration_seconds = case when room_fields ? 'default_duration_seconds'
        then (room_fields->>'default_duration_seconds')::int
        else r.default_duration_seconds end,
      updated_at = now()
    where r.id = target_room
    returning to_jsonb(r) into room_after;
    if room_after is null then
      raise exception 'room % not found', target_room using errcode = 'P0002';
    end if;
  end if;

  for u in
    select * from jsonb_array_elements(coalesce(visit_updates, '[]'::jsonb))
  loop
    f := coalesce(u->'fields', '{}'::jsonb);
    update public.checkins c set
      room_id = case when f ? 'room_id'
        then (f->>'room_id')::uuid else c.room_id end,
      room_assigned_at = case when f ? 'room_assigned_at'
        then (f->>'room_assigned_at')::timestamptz else c.room_assigned_at end,
      called_at = case when f ? 'called_at'
        then (f->>'called_at')::timestamptz else c.called_at end,
      seen_at = case when f ? 'seen_at'
        then (f->>'seen_at')::timestamptz else c.seen_at end,
      done_at = case when f ? 'done_at'
        then (f->>'done_at')::timestamptz else c.done_at end
    where c.id = (u->>'id')::uuid;
    if not found then
      raise exception 'visit % not found', u->>'id' using errcode = 'P0002';
    end if;
  end loop;

  return room_after;
end;
$$;

-- Through the service-role key only (see search_patients, 0014). The
-- roles exist on Supabase, not on a plain local Postgres.
revoke execute on function public.apply_flow_change(jsonb, uuid, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function public.apply_flow_change(jsonb, uuid, jsonb)
      from anon, authenticated;
    grant execute on function public.apply_flow_change(jsonb, uuid, jsonb)
      to service_role;
  end if;
end $$;

-- Tell the API layer the function exists now (harmless elsewhere).
notify pgrst, 'reload schema';
