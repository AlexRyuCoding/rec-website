-- What the app's role (service_role) may do, in a Postgres that is not
-- Supabase's (Cloud SQL). Run AFTER the migrations, and again after every
-- later one — deploy/ops/migrate.sh does — so a table added by a new
-- migration is never silently empty for the app. roles.sql comes first.
--
-- Safe to re-run. Not for Supabase.
--
-- On Supabase the service role skips row-level security (BYPASSRLS).
-- Cloud SQL does not let its administrator give that out, so here the
-- app's role gets through by one explicit policy per table, named
-- app_all, for service_role and nobody else. Row-level security stays ON
-- for every table: any other role still reads and writes nothing, even
-- if it were handed every grant — which is what the two SECURITY INVOKER
-- functions (search_patients, apply_flow_change) rely on.
--
-- Do not add a policy for another role, and do not grant anything to
-- anon, authenticated or authenticator. supabase/tests/app_roles.sql
-- holds all of this.

grant usage on schema public, extensions to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Tables and sequences made later by whoever runs this file (the
-- migrations' own role).
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;

do $$
declare t record;
begin
  for t in
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
  loop
    -- Only when needed: switching it on locks the table for a moment.
    if not t.relrowsecurity then
      execute format(
        'alter table public.%I enable row level security', t.relname);
    end if;
    if not exists (
      select 1 from pg_policy p
      where p.polrelid = t.oid and p.polname = 'app_all'
    ) then
      execute format(
        'create policy app_all on public.%I for all to service_role '
        'using (true) with check (true)', t.relname);
    end if;
  end loop;
end $$;
