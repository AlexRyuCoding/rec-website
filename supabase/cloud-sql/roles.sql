-- Roles for a Postgres that is not Supabase's (Cloud SQL). Supabase
-- creates these four in every project; a plain Postgres has none of them.
--
-- Run this BEFORE the migrations: 0014 and 0021 lock their functions down
-- to service_role only if a role of that name exists when they run.
-- Then the migrations, then grants.sql. deploy/ops/migrate.sh does all
-- three in that order; `npm run test:db` does the same locally.
--
-- Safe to re-run. Not for Supabase — it has these roles already.
--
--   authenticator  what PostgREST logs in as. Holds nothing itself and
--                  inherits nothing: all it can do is become the role a
--                  request's signed token names.
--   service_role   what the app's requests run as. The only role
--                  authenticator may become. Its privileges are given in
--                  grants.sql.
--   anon,          exist because the migrations name them. They hold
--   authenticated  nothing and nobody can become them: a request with no
--                  token, or a token naming them, gets nowhere.
--
-- No password here (the repository is public). migrate.sh sets
-- authenticator's from a secret; until then nothing can log in as it.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not pg_has_role('authenticator', 'service_role', 'member') then
    grant service_role to authenticator;
  end if;
end $$;
