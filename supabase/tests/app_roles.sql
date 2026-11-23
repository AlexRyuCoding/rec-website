-- Tests for the roles and grants of a database outside Supabase
-- (supabase/cloud-sql/roles.sql and grants.sql). Run with: npm run test:db
-- One transaction, rolled back.
--
-- The rule being held: a request without a valid token reads and writes
-- nothing; the app's role (service_role, reached only through a signed
-- token) can do its work; row-level security stays on everywhere.

begin;

-- 1. The roles are what PostgREST expects, and no stronger.
do $$
declare r record;
begin
  select * into r from pg_authid where rolname = 'authenticator';
  assert found, 'authenticator exists';
  assert r.rolcanlogin and not r.rolinherit,
    'authenticator logs in and inherits nothing';
  assert r.rolpassword is null, 'roles.sql sets no password';
  assert (select count(*) from pg_roles
          where rolname in ('anon', 'authenticated', 'service_role')
            and not rolcanlogin) = 3,
    'anon, authenticated and service_role exist and cannot log in';
  assert not exists (
    select 1 from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
      and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)),
    'none of the four is a superuser, skips row-level security or creates roles';
end $$;

-- 2. Without the app's role: nothing. "anon" and "authenticated" are what
-- a request would run as with no token or a foreign one; "authenticator"
-- is PostgREST's own login before it has switched to a request's role.
do $$
declare
  who text;
  t record;
  call text;
  denied boolean;
  tables int := 0;
begin
  foreach who in array array['anon', 'authenticated', 'authenticator'] loop
    execute format('set local role %I', who);
    for t in
      select c.oid, c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      order by c.relname
    loop
      tables := tables + 1;
      denied := false;
      begin
        execute format('select 1 from public.%I limit 1', t.relname);
      exception when insufficient_privilege then denied := true;
      end;
      assert denied, format('%s must not read %s', who, t.relname);

      denied := false;
      begin
        execute format('delete from public.%I', t.relname);
      exception when insufficient_privilege then denied := true;
      end;
      assert denied, format('%s must not delete from %s', who, t.relname);

      assert not has_table_privilege(who, t.oid,
          'select, insert, update, delete, truncate, references, trigger'),
        format('%s holds no privilege on %s', who, t.relname);
    end loop;

    foreach call in array array[
      'select * from public.search_patients(array[''ann''], ''{}'', 20)',
      'select public.apply_flow_change(''[]''::jsonb, null, null)'
    ] loop
      denied := false;
      begin
        execute call;
      exception when insufficient_privilege then denied := true;
      end;
      assert denied, format('%s must not call: %s', who, call);
    end loop;
    reset role;
  end loop;
  assert tables >= 3 * 12, format('every table was tried: got %s tries', tables);
end $$;

-- 3. PostgREST's login can become the app's role and no other. (This
-- needs the session to BE authenticator: a superuser may set any role.)
set local session authorization authenticator;
do $$
declare
  other text;
  denied boolean;
begin
  foreach other in array array['anon', 'authenticated', 'postgres'] loop
    denied := false;
    begin
      execute format('set local role %I', other);
    exception when insufficient_privilege then denied := true;
    end;
    assert denied, format('authenticator must not become %s', other);
  end loop;
end $$;

-- 4. As the app's role, reached the way PostgREST reaches it.
set local role service_role;
do $$
declare
  n int;
  t text;
  room jsonb;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    execute format('select count(*) from public.%I', t);
  end loop;

  insert into public.patients (id, first_name, last_name, phone, pb_client_id)
  values ('00000000-0000-4000-8000-0000000000e1', 'Zzrole', 'Tester',
          '(555) 010-0199', 'app-roles-1');
  select count(*) into n from public.patients
  where id = '00000000-0000-4000-8000-0000000000e1';
  assert n = 1, format('the app reads back the patient it added: got %s', n);

  update public.patients set first_name = 'Zzroled'
  where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 1, format('the app changes its patient: got %s', n);

  -- Uses unaccent and pg_trgm, which live in the "extensions" schema.
  select count(*) into n from public.search_patients(array['zzroled'], '{}', 20);
  assert n = 1, format('the app can search patients: got %s', n);

  insert into public.rooms (id, name, grid_row, grid_col, turnover_started_at)
  values ('00000000-0000-4000-8000-0000000000ef', 'Roles test room', 41, 0, now());
  insert into public.checkins (id, patient_id, room_id, room_assigned_at, called_at, seen_at)
  values ('00000000-0000-4000-8000-0000000000ec',
          '00000000-0000-4000-8000-0000000000e1',
          '00000000-0000-4000-8000-0000000000ef', now(), now(), now());
  room := public.apply_flow_change(
    '[{"id": "00000000-0000-4000-8000-0000000000ec",
       "fields": {"done_at": "2026-11-23T20:00:00Z"}}]'::jsonb,
    '00000000-0000-4000-8000-0000000000ef',
    '{"turnover_started_at": null}'::jsonb);
  assert room ->> 'turnover_started_at' is null and room ->> 'id' is not null,
    'the app can apply a flow change: the room came back, ready';
  assert (select done_at is not null from public.checkins
          where id = '00000000-0000-4000-8000-0000000000ec'),
    'and the visit was finished';

  -- A table whose id comes from a sequence.
  insert into public.staff_audit_log (staff_email, action)
  values ('roles-test@example.com', 'patient_search');

  delete from public.rooms where id = '00000000-0000-4000-8000-0000000000ef';
  delete from public.patients where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 1, format('the app deletes its patient: got %s', n);
end $$;
reset role;
reset session authorization;

-- 5. Row-level security is on for every table, and the only way through
-- it is the one policy for the app's role.
do $$
declare
  t record;
  tables int := 0;
begin
  for t in
    select c.oid, c.relname, c.relrowsecurity from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
  loop
    tables := tables + 1;
    assert t.relrowsecurity, format('%s has row-level security on', t.relname);
    assert (select count(*) from pg_policy p where p.polrelid = t.oid) = 1,
      format('%s has exactly one policy', t.relname);
    assert exists (
      select 1 from pg_policy p
      where p.polrelid = t.oid
        and p.polname = 'app_all'
        and p.polcmd = '*'
        and p.polpermissive
        and p.polroles = array['service_role'::regrole::oid]),
      format('%s: the policy is app_all, for service_role only', t.relname);
  end loop;
  assert tables >= 12, format('every table was checked: got %s', tables);
end $$;

-- 6. Both functions still run as their caller.
do $$
begin
  assert (select count(*) from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname in ('search_patients', 'apply_flow_change')) = 2,
    'search_patients and apply_flow_change exist, once each';
  assert not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and prosecdef),
    'no function in public is SECURITY DEFINER';
end $$;

rollback;
