-- Tests for public.staff_audit_log (migrations 0015, 0016, 0019). Run with: npm run test:db
-- One transaction, rolled back.

begin;

insert into public.staff_audit_log (staff_email, action, patient_ids, detail)
values ('desk@example.com', 'patient_search', array[gen_random_uuid()], 'ann lic');
insert into public.staff_audit_log (staff_email, action, patient_ids)
values ('desk@example.com', 'pin_reset', array[gen_random_uuid()]);

-- 0016: a check-in made by staff is a known action too
insert into public.staff_audit_log (staff_email, action, patient_ids)
values ('desk@example.com', 'staff_checkin', array[gen_random_uuid()]);

-- 0019: six more known actions
insert into public.staff_audit_log (staff_email, action, detail)
select 'desk@example.com', a, 'x'
from unnest(array[
  'checkins_view', 'checkins_export', 'visit_remove', 'visit_restore',
  'device_pair', 'device_revoke'
]) as a;

do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.staff_audit_log where at > now() - interval '1 minute';
  assert n = 9, format('nine rows with a time: got %s', n);

  -- only the known actions
  ok := false;
  begin
    insert into public.staff_audit_log (staff_email, action) values ('x@y.z', 'something_else');
  exception when check_violation then ok := true;
  end;
  assert ok, 'an unknown action is refused';

  -- a row always says who
  ok := false;
  begin
    insert into public.staff_audit_log (staff_email, action) values (null, 'pin_reset');
  exception when not_null_violation then ok := true;
  end;
  assert ok, 'staff_email is required';
end $$;

-- A deleted patient does not take the record of who looked at them along.
do $$
declare pid uuid; n int;
begin
  insert into public.patients (first_name, last_name, pb_client_id)
  values ('Gone', 'Patient', 'audit-t1') returning id into pid;
  insert into public.staff_audit_log (staff_email, action, patient_ids)
  values ('desk@example.com', 'pin_reset', array[pid]);
  delete from public.patients where id = pid;
  select count(*) into n from public.staff_audit_log where patient_ids @> array[pid];
  assert n = 1, 'the audit row outlives the patient';
end $$;

-- 0019: "everything involving this patient" finds the rows that name them.
do $$
declare pid uuid := gen_random_uuid(); n int;
begin
  insert into public.staff_audit_log (staff_email, action, patient_ids)
  values ('desk@example.com', 'checkins_view', array[gen_random_uuid(), pid, gen_random_uuid()]),
         ('desk@example.com', 'visit_remove', array[pid]),
         ('desk@example.com', 'checkins_view', array[gen_random_uuid()]);
  select count(*) into n from public.staff_audit_log where patient_ids @> array[pid];
  assert n = 2, format('two rows name the patient: got %s', n);
  delete from public.staff_audit_log where patient_ids @> array[pid];
  delete from public.staff_audit_log where action = 'checkins_view' and detail is null;
end $$;

-- Privacy: row-level security with no policies. Another role sees nothing
-- and cannot add or change rows, even with every grant.
create role audit_test_outsider;
grant usage on schema public to audit_test_outsider;
grant select, insert, update, delete on public.staff_audit_log to audit_test_outsider;
set local role audit_test_outsider;
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.staff_audit_log;
  assert n = 0, format('another role reads nothing: got %s', n);
  begin
    insert into public.staff_audit_log (staff_email, action) values ('x@y.z', 'pin_reset');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'another role cannot write';
  delete from public.staff_audit_log;
  update public.staff_audit_log set staff_email = 'changed';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.staff_audit_log) = 10, 'rows untouched by the other role';
  assert not exists (select 1 from public.staff_audit_log where staff_email = 'changed'), 'rows unchanged';
end $$;

rollback;
