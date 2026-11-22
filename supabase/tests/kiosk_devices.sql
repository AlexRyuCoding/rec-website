-- Tests for public.kiosk_devices (migration 0018). Run with: npm run test:db
-- One transaction, rolled back.

begin;

insert into public.kiosk_devices (code, secret_hash, created_ip)
values ('K7M4QX', 'hash-1', '203.0.113.5');

do $$
declare r record;
begin
  select * into r from public.kiosk_devices where code = 'K7M4QX';
  assert r.id is not null, 'a pairing gets an id';
  assert r.created_at > now() - interval '1 minute', 'and a time';
  assert r.approved_at is null and r.revoked_at is null, 'it starts unapproved';
end $$;

-- A kiosk pairing is not a TV pairing: the tables are separate.
do $$
begin
  assert not exists (select 1 from public.display_devices where code = 'K7M4QX'),
    'a kiosk code is unknown to the waiting-room screens';
end $$;

-- Privacy: row-level security with no policies. Another role sees nothing
-- and cannot add or change rows, even with every grant.
create role kiosk_test_outsider;
grant usage on schema public to kiosk_test_outsider;
grant select, insert, update, delete on public.kiosk_devices to kiosk_test_outsider;
set local role kiosk_test_outsider;
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.kiosk_devices;
  assert n = 0, format('another role reads nothing: got %s', n);
  begin
    insert into public.kiosk_devices (code, secret_hash) values ('AAAAAA', 'x');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'another role cannot add a pairing';
  update public.kiosk_devices set approved_at = now();
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.kiosk_devices where approved_at is not null) = 0,
    'another role cannot approve a pairing';
end $$;

rollback;
