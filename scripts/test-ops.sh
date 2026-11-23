#!/usr/bin/env bash
# Tests the two operations scripts — deploy/ops/migrate.sh and
# deploy/ops/copy-data.sh — against a throwaway local Postgres with two
# databases: "src" stands in for the database being left, "dst" for the
# new one. Needs Postgres installed (initdb, pg_ctl, psql, pg_dump).
# Made-up rows only; nothing is sent to Supabase or Google Cloud.
# Usage: npm run test:ops
set -euo pipefail

cd "$(dirname "$0")/.."

# POSTGRES_IMAGE=postgres:17 npm run test:ops — the same test inside that
# Docker image instead of this computer's Postgres: the way to run it on
# the version pinned in deploy/versions.env (what Cloud SQL runs).
if [ -n "${POSTGRES_IMAGE:-}" ]; then
  exec docker run --rm -u postgres -v "$PWD":/repo:ro -w /repo \
    "$POSTGRES_IMAGE" bash scripts/test-ops.sh
fi

PORT="${TEST_OPS_PORT:-54328}"
DIR="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$DIR/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

initdb -D "$DIR/pg" -U postgres >/dev/null 2>&1
# TCP only: a temp path can be too long for a unix socket.
pg_ctl -D "$DIR/pg" -w -l "$DIR/log" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  start >/dev/null

# The scripts find their database through libpq's own variables. They run
# as "ops_admin", made below like Cloud SQL's administrator: NOT a
# superuser — it may create roles and owns the tables, nothing more. (The
# test does its own looking and seeding as the superuser.)
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=ops_admin
# Made up for this test; real ones live in a secret store, never here.
PASSWORD="made-up-for-tests-0nly"
SRC_URL="postgresql://ops_admin@127.0.0.1:$PORT/src"

TABLES="patients rooms doctors checkins display_devices kiosk_devices waiting_room_music radio_stations staff_audit_log"
NOT_COPIED="pin_attempt_failures form_submission_events day_schedule_cache"

# sql <database> <statement> — as the superuser; prints the answer, bare.
sql() {
  psql -U postgres -X -q -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"
}
ok() {
  echo "ok  $1"
}
fail() {
  echo "FAILED  $1" >&2
  exit 1
}
# same <what> <got> <wanted>
same() {
  [ "$2" = "$3" ] || fail "$1: got '$2', wanted '$3'"
}
migrate() { # migrate <database>
  PGDATABASE="$1" AUTHENTICATOR_PASSWORD="$PASSWORD" bash deploy/ops/migrate.sh
}
copy_data() { # copy_data <argument> [source address]
  PGDATABASE=dst SOURCE_DATABASE_URL="${2:-$SRC_URL}" \
    bash deploy/ops/copy-data.sh "$1"
}
counts() { # counts <database> — "patients=3 rooms=1 …" for the nine tables
  local line="" t
  for t in $TABLES; do
    line="$line$t=$(sql "$1" "select count(*) from public.$t") "
  done
  echo "$line"
}
# What a table holds, as one fingerprint — to compare two databases
# without printing a row.
fingerprint() { # fingerprint <database> <table>
  sql "$1" "select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.$2 t"
}

sql postgres "create role ops_admin login createrole createdb" >/dev/null
sql postgres "create database src owner ops_admin" >/dev/null
sql postgres "create database dst owner ops_admin" >/dev/null
sql postgres "create database bare owner ops_admin" >/dev/null
# From Postgres 15 a database's owner owns its "public" schema; make it so
# on older ones too, so the test is the same everywhere.
for db in src dst bare; do
  sql "$db" "alter schema public owner to ops_admin"
done
MIGRATIONS="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"

# ---------------------------------------------------------------- migrate

if out="$(PGDATABASE=bare bash deploy/ops/migrate.sh 2>&1)"; then
  fail "migrate.sh must refuse to run without AUTHENTICATOR_PASSWORD"
fi
same "nothing was built without the password" \
  "$(sql bare "select count(*) from pg_namespace where nspname = 'ops'")" "0"
ok "migrate.sh refuses to run without AUTHENTICATOR_PASSWORD"

# 1. Every migration, once.
out="$(migrate dst 2>&1)" || fail "migrate.sh on an empty database: $out"
same "one 'applied' line per migration" \
  "$(echo "$out" | grep -c '^applied [0-9][0-9][0-9][0-9]_.*\.sql$')" "$MIGRATIONS"
same "every migration is recorded" \
  "$(sql dst "select count(*) from ops.schema_migrations")" "$MIGRATIONS"
same "the tables exist" \
  "$(sql dst "select count(*) from public.patients")" "0"
ok "migrate.sh applies every migration ($MIGRATIONS)"

case "$out" in *"$PASSWORD"*) fail "migrate.sh printed the password" ;; esac
same "authenticator has a password, stored hashed" \
  "$(sql dst "select rolpassword is not null and rolpassword not like '%$PASSWORD%' from pg_authid where rolname = 'authenticator'")" "t"
ok "migrate.sh sets authenticator's password and never prints it"

out="$(migrate dst 2>&1)" || fail "migrate.sh, second run: $out"
same "second run" "$out" "nothing to apply"
ok "a second run prints 'nothing to apply'"

# 2. A table added later is never silently empty for the app.
# (Made by the administrator, as a later migration would make it.)
psql -X -q -v ON_ERROR_STOP=1 -d dst -c "create table public.later_table (id int primary key)"
out="$(migrate dst 2>&1)" || fail "migrate.sh after a new table: $out"
same "the new table has row-level security" \
  "$(sql dst "select relrowsecurity from pg_class where oid = 'public.later_table'::regclass")" "t"
same "the new table has the app_all policy, for service_role only" \
  "$(sql dst "select count(*) from pg_policy where polrelid = 'public.later_table'::regclass and polname = 'app_all' and polroles = array['service_role'::regrole::oid]")" "1"
same "the app's role can use the new table" \
  "$(sql dst "set role service_role; insert into public.later_table values (1); select count(*) from public.later_table")" "1"
sql dst "drop table public.later_table"
ok "a table added later gets row-level security, app_all, and works for service_role"

# A migration that fails: nothing of it stays, and nothing after it runs.
mkdir -p "$DIR/root"
cp -R supabase "$DIR/root/supabase"
cat > "$DIR/root/supabase/migrations/9998_broken.sql" <<'SQL'
create table public.half_made (id int primary key);
select 1 / 0;
SQL
echo "create table public.never_made (id int primary key);" \
  > "$DIR/root/supabase/migrations/9999_after.sql"
if out="$(ROOT="$DIR/root" migrate dst 2>&1)"; then
  fail "migrate.sh must stop with an error at a failing migration"
fi
same "the failing migration left nothing behind, and the next one did not run" \
  "$(sql dst "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('half_made', 'never_made')")" "0"
same "neither is recorded as applied" \
  "$(sql dst "select count(*) from ops.schema_migrations where filename like '999%'")" "0"
ok "a failing migration stops everything and leaves nothing half-applied"

# ------------------------------------------------------------------- copy

# 3. The database being left, with made-up rows.
out="$(migrate src 2>&1)" || fail "migrate.sh on src: $out"
psql -U postgres -X -q -v ON_ERROR_STOP=1 -d src >/dev/null <<'SQL'
insert into public.patients (id, first_name, last_name, email, phone, pin, pin_lookup, pb_client_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'Opal', 'Madeupson', 'opal@example.com', '(555) 010-0101',
   'made-up-hash-not-a-real-bcrypt-value', 'k1:made-up-fingerprint', 'ops-test-1'),
  ('00000000-0000-4000-8000-0000000000a2', 'Quill', 'Sampleton', null, '555-010-0102', null, null, 'ops-test-2'),
  ('00000000-0000-4000-8000-0000000000a3', 'Wren', 'Fakename', 'wren@example.com', null, null, null, 'ops-test-3');
insert into public.rooms (id, name, grid_row, grid_col)
values ('00000000-0000-4000-8000-00000000000f', 'Ops test room', 40, 0);
insert into public.doctors (name, color) values ('Dr. Example', 'violet');
insert into public.checkins (patient_id, room_id, room_assigned_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000f', now()),
  ('00000000-0000-4000-8000-0000000000a2', null, null);
insert into public.display_devices (code, secret_hash) values ('TV7M4Q', 'made-up-hash-tv');
insert into public.kiosk_devices (code, secret_hash) values ('K7M4QX', 'made-up-hash-kiosk');
update public.waiting_room_music set
  source = 'radio', radio_name = 'Made-up FM', radio_url = 'https://stream.example.com/live',
  volume = 35, spotify_refresh_token = 'sealed', spotify_account_name = 'Made-up account',
  spotify_connected_at = now();
insert into public.radio_stations (name, url) values ('Made-up FM', 'https://stream.example.com/live');
insert into public.staff_audit_log (staff_email, action, patient_ids, detail) values
  ('front-desk@example.com', 'patient_search', '{00000000-0000-4000-8000-0000000000a1}', 'opal'),
  ('front-desk@example.com', 'pin_reset', '{00000000-0000-4000-8000-0000000000a1}', null);
insert into public.pin_attempt_failures default values;
insert into public.form_submission_events (ip) values ('203.0.113.9');
SQL
same "the music row is the one the migration made" \
  "$(sql src "select count(*) from public.waiting_room_music")" "1"
SRC_COUNTS="$(counts src)"
ok "src is seeded with made-up rows ($SRC_COUNTS)"

# 4. The copy.
out="$(copy_data copy 2>&1)" || fail "copy-data.sh copy: $out"
same "one line per table, and nothing else" "$(echo "$out" | wc -l | tr -d ' ')" "9"
for t in $TABLES; do
  n="$(sql src "select count(*) from public.$t")"
  echo "$out" | grep -qx "$t source=$n dest=$n ok" \
    || fail "copy must print '$t source=$n dest=$n ok'; it printed: $out"
done
case "$out" in *Madeupson* | *opal@* | *sealed*) fail "copy printed a row" ;; esac
same "every table has the source's number of rows" "$(counts dst)" "$SRC_COUNTS"
for t in $TABLES; do
  [ "$t" = waiting_room_music ] && continue
  same "$t holds the same rows" "$(fingerprint dst "$t")" "$(fingerprint src "$t")"
done
same "the PIN and its fingerprint came across" \
  "$(sql dst "select pin || ' ' || pin_lookup from public.patients where pb_client_id = 'ops-test-1'")" \
  "made-up-hash-not-a-real-bcrypt-value k1:made-up-fingerprint"
same "the music setting came across" \
  "$(sql dst "select source || ' ' || radio_url || ' ' || volume from public.waiting_room_music")" \
  "radio https://stream.example.com/live 35"
same "Spotify's three columns are cleared in dst" \
  "$(sql dst "select count(*) from public.waiting_room_music where spotify_refresh_token is null and spotify_account_name is null and spotify_connected_at is null")" "1"
same "and untouched in src" \
  "$(sql src "select spotify_refresh_token from public.waiting_room_music")" "sealed"
for t in $NOT_COPIED; do
  same "$t is not copied" "$(sql dst "select count(*) from public.$t")" "0"
done
sql dst "insert into public.staff_audit_log (staff_email, action) values ('front-desk@example.com', 'pin_reset')" \
  || fail "a new audit row after the copy (its id sequence was not moved on)"
ok "copy: equal rows in all nine tables, Spotify cleared, short-lived tables left out, sequences moved on"

# 5. Again, with rows added in between: no duplicates, no leftovers.
sql dst "insert into public.patients (first_name, last_name, pb_client_id) values ('Left', 'Over', 'ops-test-4')"
out="$(copy_data copy 2>&1)" || fail "copy-data.sh copy, second run: $out"
same "exactly the source's 3 patients" "$(sql dst "select count(*) from public.patients")" "3"
same "no table has duplicates or leftovers" "$(counts dst)" "$SRC_COUNTS"
for t in $TABLES; do
  [ "$t" = waiting_room_music ] && continue
  same "$t holds the same rows after a second copy" "$(fingerprint dst "$t")" "$(fingerprint src "$t")"
done
ok "a second copy leaves dst equal to src: no duplicates, no leftovers"

# 6. A copy that fails leaves the destination as it was.
if out="$(copy_data copy "postgresql://ops_admin@127.0.0.1:$PORT/no_such_database" 2>&1)"; then
  fail "copy must fail when the source cannot be reached"
fi
same "dst still holds its rows" "$(counts dst)" "$SRC_COUNTS"
ok "an unreachable source: copy fails and dst keeps its rows"

if out="$(PGDATABASE=dst bash deploy/ops/copy-data.sh copy 2>&1)"; then
  fail "copy must refuse to run without SOURCE_DATABASE_URL"
fi
same "dst still holds its rows" "$(counts dst)" "$SRC_COUNTS"
ok "copy refuses to run without SOURCE_DATABASE_URL"

# Failing part-way through the load: a source whose rows dst cannot take
# (two stations with one address). Tables loaded before it must be rolled
# back too, and the error must not print the row.
sql postgres "create database src_bad template src" >/dev/null
sql src_bad "alter table public.radio_stations drop constraint radio_stations_url_key"
sql src_bad "insert into public.radio_stations (name, url) values ('Twin FM', 'https://stream.example.com/live')"
sql src_bad "insert into public.patients (first_name, last_name, pb_client_id) values ('Only', 'Insrcbad', 'ops-test-5')"
if out="$(copy_data copy "postgresql://ops_admin@127.0.0.1:$PORT/src_bad" 2>&1)"; then
  fail "copy must fail when dst refuses a row"
fi
same "dst still holds its rows" "$(counts dst)" "$SRC_COUNTS"
same "and they are still the old source's" "$(fingerprint dst patients)" "$(fingerprint src patients)"
case "$out" in *stream.example.com* | *"Twin FM"*) fail "a failed copy printed a row: $out" ;; esac
ok "a copy that fails part-way rolls everything back and prints no row"

# A count that differs is said, and is an error.
sql dst "create function public.ops_test_drop_row() returns trigger language plpgsql as 'begin return null; end'"
sql dst "create trigger ops_test_drop_row before insert on public.doctors for each row execute function public.ops_test_drop_row()"
if out="$(copy_data copy 2>&1)"; then
  fail "copy must exit non-zero when a count differs"
fi
echo "$out" | grep -qx "doctors source=1 dest=0 MISMATCH" \
  || fail "copy must print 'doctors source=1 dest=0 MISMATCH'; it printed: $out"
same "the other eight are still reported ok" "$(echo "$out" | grep -c ' ok$')" "8"
sql dst "drop trigger ops_test_drop_row on public.doctors"
sql dst "drop function public.ops_test_drop_row()"
out="$(copy_data copy 2>&1)" || fail "copy-data.sh copy, after the mismatch: $out"
ok "a table whose counts differ is reported as MISMATCH, with a non-zero exit"

# 7. Empty.
out="$(copy_data empty 2>&1)" || fail "copy-data.sh empty: $out"
for t in $TABLES; do
  same "$t is empty" "$(sql dst "select count(*) from public.$t")" "0"
done
case "$out" in *Madeupson*) fail "empty printed a row" ;; esac
ok "empty: all nine tables have 0 rows"

if out="$(copy_data sideways 2>&1)"; then
  fail "copy-data.sh must refuse an argument it does not know"
fi
ok "copy-data.sh refuses an unknown argument"
