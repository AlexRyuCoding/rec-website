-- Tests for patients.pin_lookup (migration 0017). Run with: npm run test:db
-- One transaction, rolled back.

begin;

insert into public.patients (first_name, last_name, pb_client_id, pin, pin_lookup) values
  ('Ann',  'Licater', 'pl-1', 'hash-a', 'fp-1111'),
  ('Bob',  'Stone',   'pl-2', 'hash-b', null),
  ('Cara', 'Diaz',    'pl-3', null,     null);

do $$
declare ok boolean; got text;
begin
  -- one patient per PIN
  ok := false;
  begin
    update public.patients set pin_lookup = 'fp-1111' where pb_client_id = 'pl-2';
  exception when unique_violation then ok := true;
  end;
  assert ok, 'a second patient cannot take the same fingerprint';

  -- any number of patients may have none
  update public.patients set pin_lookup = null where pb_client_id in ('pl-2', 'pl-3');

  -- stamping a fingerprint (PIN unchanged) keeps it
  update public.patients set pin_lookup = 'fp-2222' where pb_client_id = 'pl-2';
  select pin_lookup into got from public.patients where pb_client_id = 'pl-2';
  assert got = 'fp-2222', 'a stamped fingerprint stays';

  -- an unrelated update (the Practice Better sync) leaves it alone
  update public.patients set first_name = 'Robert', phone = '555' where pb_client_id = 'pl-2';
  select pin_lookup into got from public.patients where pb_client_id = 'pl-2';
  assert got = 'fp-2222', 'a sync does not touch the fingerprint';

  -- staff "Reset PIN" clears the fingerprint with the PIN
  update public.patients set pin = null where pb_client_id = 'pl-1';
  select pin_lookup into got from public.patients where pb_client_id = 'pl-1';
  assert got is null, 'resetting the PIN clears its fingerprint';

  -- ...so the number is free for someone else straight away
  update public.patients set pin = 'hash-c', pin_lookup = 'fp-1111' where pb_client_id = 'pl-3';
  select pin_lookup into got from public.patients where pb_client_id = 'pl-3';
  assert got = 'fp-1111', 'a new PIN saved with its fingerprint keeps it';

  -- a PIN changed by code that does not know the column loses the old fingerprint
  update public.patients set pin = 'hash-d' where pb_client_id = 'pl-2';
  select pin_lookup into got from public.patients where pb_client_id = 'pl-2';
  assert got is null, 'a changed PIN never keeps the old fingerprint';
end $$;

rollback;
