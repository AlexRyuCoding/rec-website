#!/usr/bin/env bash
# Tests the operations scripts — deploy/ops/migrate.sh,
# deploy/ops/copy-data.sh and deploy/ops/stamp-pins.sh — against a
# throwaway local Postgres: "src" stands in for the database being left,
# "dst" for the new one, and the stamping has databases of its own. Needs
# Postgres installed (initdb, pg_ctl, psql, pg_dump) and Node with the
# repository's packages (npm install).
# Made-up rows only; nothing is sent to Supabase or Google Cloud.
# Usage: npm run test:ops
set -euo pipefail

cd "$(dirname "$0")/.."

# POSTGRES_IMAGE=postgres:17 npm run test:ops — the same test in Docker
# instead of on this computer's Postgres: the way to run it on the
# version pinned in deploy/versions.env (what Cloud SQL runs). It runs
# inside the OPS IMAGE (deploy/ops.Dockerfile) built on that Postgres, as
# Cloud Build builds it — so the stamping that is tested is the image's
# own copy, with the image's Node and the image's bcryptjs.
if [ -n "${POSTGRES_IMAGE:-}" ]; then
  # shellcheck disable=SC1091
  . deploy/versions.env
  docker build -q -f deploy/ops.Dockerfile \
    --build-arg POSTGRES_IMAGE="$POSTGRES_IMAGE" \
    --build-arg OPS_NODE_VERSION="$OPS_NODE_VERSION" \
    -t rac-ops:test-ops . >/dev/null
  exec docker run --rm -v "$PWD":/repo:ro -w /repo \
    -e STAMP_PINS=/app/deploy/ops/stamp-pins.sh \
    rac-ops:test-ops bash scripts/test-ops.sh
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

# ------------------------------------------------------------- stamp-pins
# deploy/ops/stamp-pins.sh gives every PIN holder the fingerprint the
# kiosk looks them up by. Made-up patients; their hashes are made here by
# bcryptjs from PINs this test knows. What the job is checked against is
# the APP's own fingerprint — src/lib/pin-lookup.ts, run by Node as it
# stands — never the job's copy of it.
#
# Inside the ops image (POSTGRES_IMAGE=…, see the top) STAMP_PINS names
# the image's own copy: its Node, its bcryptjs.
STAMP_PINS="${STAMP_PINS:-deploy/ops/stamp-pins.sh}"
STAMP_DIR="$(cd "$(dirname "$STAMP_PINS")/stamp-pins" && pwd)"
# Made up for this test.
SECRET="made-up-secret-for-this-test-only"
OLD_SECRET="the-made-up-secret-before-a-rotation"

# stamp <database> <argument…> — more settings in front: X=1 stamp …
# The job must END, whatever it finds: it is stopped after three minutes
# (the alarm outlives perl's hand-over to the job), which fails the test.
stamp() {
  local db="$1"
  shift
  PGDATABASE="$db" NEXTAUTH_SECRET="$SECRET" \
    perl -e 'alarm shift; exec @ARGV or die' 180 bash "$STAMP_PINS" "$@"
}
hash_of() { # hash_of <pin> [cost] — a bcryptjs hash; cost 4 keeps the test quick
  (cd "$STAMP_DIR" && node --input-type=module \
    -e 'import bcrypt from "bcryptjs"; process.stdout.write(bcrypt.hashSync(process.argv[1], Number(process.argv[2])));' \
    "$1" "${2:-4}")
}
app_fingerprint() { # app_fingerprint <pin> [secret] — as the app makes it
  node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
    --input-type=module \
    -e 'const app = await import(process.argv[1]); process.stdout.write(app.pinFingerprint(process.argv[2], process.argv[3]));' \
    "$PWD/src/lib/pin-lookup.ts" "$1" "${2:-$SECRET}"
}
pin_id() { # pin_id <n> — a made-up patient id; a lower n sorts first
  printf '00000000-0000-4000-8000-0000000000%02d' "$1"
}
# add_holder <database> <n> <first name> <hash or ''> [fingerprint]
add_holder() {
  local pin="null" lookup="null"
  [ -z "$4" ] || pin="'$4'"
  [ -z "${5:-}" ] || lookup="'$5'"
  sql "$1" "insert into public.patients (id, first_name, last_name, pb_client_id, pin, pin_lookup) values ('$(pin_id "$2")', '$3', 'Madeupson', 'stamp-test-$2', $pin, $lookup)"
}
# Somebody has signed in at the kiosk since fingerprints exist: one holder
# the app stamped itself, with the site's secret. It is the evidence
# `stamp` asks for before it writes anything (scene 2) — on the live
# database such patients exist; every scene that stamps has one.
SIGNED_IN=90
add_signed_in() { # add_signed_in <database>
  add_holder "$1" "$SIGNED_IN" Regular "$(hash_of 0909)" "$(app_fingerprint 0909)"
}
# stand_in <name> <call number> <command…> — a psql that notes how it was
# called and, before the job's Nth call, runs the command: what happens
# at the kiosk in the middle of the job. Prints the folder to put first
# in PATH; the calls are noted in <folder>/calls.
REAL_PSQL="$(command -v psql)"
stand_in() {
  local dir="$DIR/stand-in-$1" at="$2"
  shift 2
  mkdir -p "$dir"
  {
    echo '#!/usr/bin/env bash'
    echo "printf '%s\\n' \"\$*\" >> \"$dir/calls\""
    echo "if [ \"\$(wc -l < \"$dir/calls\" | tr -d ' ')\" = \"$at\" ]; then"
    echo "  $*"
    echo 'fi'
    echo "exec \"$REAL_PSQL\" \"\$@\""
  } > "$dir/psql"
  chmod +x "$dir/psql"
  echo "$dir"
}
lookup_of() { # lookup_of <database> <n> — the stored fingerprint, or ''
  sql "$1" "select coalesce(pin_lookup, '') from public.patients where id = '$(pin_id "$2")'"
}
pin_of() { # pin_of <database> <n> — the stored hash, or ''
  sql "$1" "select coalesce(pin, '') from public.patients where id = '$(pin_id "$2")'"
}
# Everything the job could change, as one value.
pins_state() { # pins_state <database>
  sql "$1" "select md5(coalesce(string_agg(id::text || ':' || coalesce(pin, '-') || ':' || coalesce(pin_lookup, '-'), '|' order by id), '')) from public.patients"
}
# says <output> <field> — the number after "field=" on the job's "done" line
says() {
  printf '%s\n' "$1" | sed -n "s/^stamp-pins task .* done:.* $2=\([0-9][0-9]*\).*/\1/p"
}
# Counts only: never a PIN, a hash, a fingerprint, an id or a name.
# no_patient_data <what> <output> <database> <pin…>
no_patient_data() {
  local what="$1" out="$2" db="$3" secret
  shift 3
  while read -r secret; do
    [ -n "$secret" ] || continue
    case "$out" in *"$secret"*) fail "$what printed something of a patient's" ;; esac
  done < <(
    sql "$db" "select id::text from public.patients"
    sql "$db" "select pin from public.patients where pin is not null"
    sql "$db" "select pin_lookup from public.patients where pin_lookup is not null"
    sql "$db" "select left(pin_lookup, 8) from public.patients where pin_lookup is not null"
    sql "$db" "select first_name from public.patients"
    echo "Madeupson"
    echo "$SECRET"
    printf '%s\n' "$@"
  )
}

if ! command -v node >/dev/null 2>&1; then
  fail "stamp-pins needs Node, and this has none. Inside Docker the test runs in the ops image: POSTGRES_IMAGE=postgres:17 npm run test:ops"
fi

# The check the ops image is built behind (deploy/ops.Dockerfile): the
# job's fingerprint against the app's source. It must also be able to
# fail — a guard that lets everything through is worse than none.
out="$(node "$STAMP_DIR/check-parity.mjs" "$PWD/src/lib/pin-lookup.ts" 2>&1)" \
  || fail "check-parity.mjs against the app's pin-lookup.ts: $out"
sed 's/rac-pin-lookup-v1/rac-pin-lookup-v2/' src/lib/pin-lookup.ts > "$DIR/drifted.ts"
if out="$(node "$STAMP_DIR/check-parity.mjs" "$DIR/drifted.ts" 2>&1)"; then
  fail "check-parity.mjs must fail when the app's fingerprint is made differently"
fi
if out="$(node "$STAMP_DIR/check-parity.mjs" "$DIR/no-such-file.ts" 2>&1)"; then
  fail "check-parity.mjs must fail when it cannot load the app's file"
fi
if out="$(node "$STAMP_DIR/check-parity.mjs" 2>&1)"; then
  fail "check-parity.mjs must fail when it is not told where the app's file is"
fi
ok "check-parity.mjs: the job's fingerprint equals the app's, and a difference is caught"

# One built database, copied for each scene below.
sql postgres "create database pins_base owner ops_admin" >/dev/null
sql pins_base "alter schema public owner to ops_admin"
out="$(migrate pins_base 2>&1)" || fail "migrate.sh on pins_base: $out"
new_pins_db() { # new_pins_db <name>
  sql postgres "create database $1 template pins_base owner ops_admin" >/dev/null
}

# 1. The ordinary run.
new_pins_db pins
H1="$(hash_of 1234 8)" # as the app makes them: cost 8
H2="$(hash_of 0000)"
H4="$(hash_of 0704)"
H6="$(hash_of 8351)" # nothing likely about it: found late
H7="$(hash_of 2580)"
H7="\$2a${H7#\$2b}" # the same hash as an older library wrote it
add_holder pins 1 Opal "$H1"
add_holder pins 2 Quill "$H2"
# Has signed in since fingerprints exist: stamped by the app itself.
add_holder pins 4 Ada "$H4" "$(app_fingerprint 0704)"
add_holder pins 5 Nopin ""
add_holder pins 6 Late "$H6"
add_holder pins 7 Older "$H7"
PINS="1234 0000 0704 8351 2580"

before="$(pins_state pins)"
out="$(stamp pins count 2>&1)" || fail "stamp-pins.sh count: $out"
echo "$out" | grep -qx "stamp-pins count: pin_holders=5 current=1 without=4 never_stamped=4 other_key=0 unusable=0" \
  || fail "count must say 5 holders, 1 current, 4 without; it said: $out"
echo "$out" | grep -q "^stamp-pins count: .*minute" || fail "count must give a rough time: $out"
case "$out" in *"would refuse"*) fail "count said stamp would refuse when nothing stands in its way: $out" ;; esac
echo "$out" | grep -qx "stamp-pins count: nothing was changed" || fail "count must say it changed nothing: $out"
same "count changes nothing" "$(pins_state pins)" "$before"
# shellcheck disable=SC2086
no_patient_data "count" "$out" pins $PINS
ok "count: how many PIN holders have no current fingerprint, a rough time, and no change"

out="$(stamp pins stamp 2>&1)" || fail "stamp-pins.sh stamp: $out"
same "four were looked at" "$(says "$out" seen)" "4"
same "four were stamped" "$(says "$out" stamped)" "4"
same "the app's fingerprint for a PIN hashed at cost 8" "$(lookup_of pins 1)" "$(app_fingerprint 1234)"
same "the app's fingerprint for 0000" "$(lookup_of pins 2)" "$(app_fingerprint 0000)"
same "a PIN found late is found all the same" "$(lookup_of pins 6)" "$(app_fingerprint 8351)"
same "a \$2a\$ hash is read like a \$2b\$ one" "$(lookup_of pins 7)" "$(app_fingerprint 2580)"
ok "stamp, with a patient the app has stamped as its evidence: each holder gets exactly the fingerprint the app makes for their PIN"

same "a patient with a current fingerprint is left alone" "$(lookup_of pins 4)" "$(app_fingerprint 0704)"
same "a patient without a PIN gets nothing" "$(lookup_of pins 5)" ""
same "no hash was touched" \
  "$(pin_of pins 1)|$(pin_of pins 2)|$(pin_of pins 4)|$(pin_of pins 5)|$(pin_of pins 6)|$(pin_of pins 7)" \
  "$H1|$H2|$H4||$H6|$H7"
ok "stamp: current fingerprints, patients without a PIN and every hash are left as they were"

# shellcheck disable=SC2086
no_patient_data "stamp" "$out" pins $PINS
ok "stamp prints counts only: no PIN, hash, fingerprint, id or name"

# Rule 2, against this real Postgres: 0017's trigger clears pin_lookup
# when pin changes without a new fingerprint. The job writes pin_lookup
# alone — and it stayed (above), with the trigger in place and switched on:
same "the trigger that clears a stale fingerprint is in place" \
  "$(sql pins "select count(*) from pg_trigger where tgname = 'patients_clear_stale_pin_lookup' and tgenabled = 'O'")" "1"

after_first="$(pins_state pins)"
out="$(stamp pins stamp 2>&1)" || fail "stamp-pins.sh stamp, second run: $out"
same "a second run finds nobody to look at" "$(says "$out" seen)" "0"
same "a second run changes nothing" "$(pins_state pins)" "$after_first"
out="$(stamp pins count 2>&1)" || fail "stamp-pins.sh count, afterwards: $out"
echo "$out" | grep -qx "stamp-pins count: pin_holders=5 current=5 without=0 never_stamped=0 other_key=0 unusable=0" \
  || fail "count must say nobody is left; it said: $out"
case "$out" in *"would refuse"*) fail "count said stamp would refuse when nobody is left: $out" ;; esac
ok "a second run changes nothing, and count then says nobody is left"

# 2. Is the job's secret the site's? A fingerprint made with another
#    secret is useless to the kiosk, and stamping with one would replace
#    the app's own. The only evidence the job can have is a patient the
#    APP has stamped (they signed in since fingerprints exist): their
#    fingerprint starts with this secret's key id. So `stamp` refuses,
#    and writes nothing, (a) while nobody has a current fingerprint, and
#    (b) while anybody has one made with another secret.
new_pins_db nobody_yet
add_holder nobody_yet 81 Opal "$(hash_of 1234)"
add_holder nobody_yet 82 Quill "$(hash_of 0000)"
before="$(pins_state nobody_yet)"
if out="$(stamp nobody_yet stamp 2>&1)"; then
  fail "stamp must refuse while no patient has a fingerprint made with its secret: $out"
fi
echo "$out" | grep -q "^stamp-pins task 1/1 stopped: refusing to stamp, nothing was written: no patient" \
  || fail "the refusal must say why, in one line: $out"
same "the refusal is one line" "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" "1"
same "a refused stamp wrote nothing" "$(pins_state nobody_yet)" "$before"
no_patient_data "a refused stamp" "$out" nobody_yet 1234 0000
out="$(stamp nobody_yet count 2>&1)" || fail "stamp-pins.sh count, with nobody stamped yet: $out"
echo "$out" | grep -qx "stamp-pins count: pin_holders=2 current=0 without=2 never_stamped=2 other_key=0 unusable=0" \
  || fail "count must say 2 holders, none current; it said: $out"
echo "$out" | grep -q "^stamp-pins count: stamp would refuse: no patient" \
  || fail "count must say that stamp would refuse, and why: $out"
ok "stamp refuses, and writes nothing, while no patient has a fingerprint made with its secret"

# One of them signs in at the kiosk: the app stamps them. Now it runs.
sql nobody_yet "update public.patients set pin_lookup = '$(app_fingerprint 1234)' where id = '$(pin_id 81)'"
out="$(stamp nobody_yet stamp 2>&1)" || fail "stamp-pins.sh stamp, once a patient has signed in: $out"
same "the other one is stamped" "$(says "$out" stamped)" "1"
same "with the app's fingerprint" "$(lookup_of nobody_yet 82)" "$(app_fingerprint 0000)"
ok "once one patient has signed in at the kiosk, stamp runs"

# After NEXTAUTH_SECRET really was replaced every fingerprint is from the
# old secret. That is the one case with its own way in.
new_pins_db rotated
H3="$(hash_of 1975)"
add_holder rotated 1 Opal "$(hash_of 1234)"
add_holder rotated 3 Wren "$H3" "$(app_fingerprint 1975 "$OLD_SECRET")"
before="$(pins_state rotated)"
out="$(stamp rotated count 2>&1)" || fail "stamp-pins.sh count, after a new secret: $out"
echo "$out" | grep -qx "stamp-pins count: pin_holders=2 current=0 without=2 never_stamped=1 other_key=1 unusable=0" \
  || fail "count must say 2 holders, 1 never stamped, 1 under another key; it said: $out"
echo "$out" | grep -q "^stamp-pins count: stamp would refuse: 1 fingerprint.* another NEXTAUTH_SECRET" \
  || fail "count must point out fingerprints made with another secret: $out"
if out="$(stamp rotated stamp 2>&1)"; then
  fail "stamp must refuse while a fingerprint made with another secret exists: $out"
fi
echo "$out" | grep -q "^stamp-pins task 1/1 stopped: refusing to stamp, nothing was written: 1 fingerprint.* another NEXTAUTH_SECRET.*stamp-after-new-secret" \
  || fail "the refusal must say why, and name the way in after a new secret: $out"
same "a refused stamp wrote nothing" "$(pins_state rotated)" "$before"
# The way in after a new secret wants its evidence too: one patient the
# site has stamped with the NEW secret. Without one, nothing shows that
# the job was given it.
if out="$(stamp rotated stamp-after-new-secret 2>&1)"; then
  fail "stamp-after-new-secret must refuse while no patient has a fingerprint made with its secret: $out"
fi
echo "$out" | grep -q "^stamp-pins task 1/1 stopped: refusing to stamp, nothing was written: no patient" \
  || fail "the refusal of stamp-after-new-secret must say why: $out"
same "a refused stamp-after-new-secret wrote nothing" "$(pins_state rotated)" "$before"
# With a patient who has signed in since: plain stamp still refuses the
# other-key ones.
add_signed_in rotated
if out="$(stamp rotated stamp 2>&1)"; then
  fail "stamp must refuse fingerprints of another secret even when some are current: $out"
fi
ok "stamp refuses, and writes nothing, while a fingerprint made with another secret exists"

out="$(stamp rotated stamp-after-new-secret 2>&1)" || fail "stamp-pins.sh stamp-after-new-secret: $out"
same "both were looked at" "$(says "$out" seen)" "2"
same "both were stamped" "$(says "$out" stamped)" "2"
same "a fingerprint made under an older secret is replaced" "$(lookup_of rotated 3)" "$(app_fingerprint 1975)"
same "its hash was not touched" "$(pin_of rotated 3)" "$H3"
same "the never-stamped one is stamped too" "$(lookup_of rotated 1)" "$(app_fingerprint 1234)"
no_patient_data "stamp-after-new-secret" "$out" rotated 1234 1975 0909
out="$(stamp rotated stamp 2>&1)" || fail "plain stamp, once no fingerprint of another secret is left: $out"
same "and finds nobody" "$(says "$out" seen)" "0"
ok "stamp-after-new-secret replaces fingerprints from before a secret rotation, once a patient has signed in under the new one"

# 3. Two patients with one PIN (possible in data from before the unique
#    index), a hash no PIN matches, and values that are not hashes at all.
#    Of two unstamped patients on one PIN the kiosk signs in the first by
#    id (pin-server.ts reads them in id order), so that is who the
#    fingerprint goes to; the other is left without one: counted, never
#    fatal. (Patient 22 below, already stamped, is also this scene's
#    evidence that the secret is the site's.)
new_pins_db odd
add_holder odd 11 First "$(hash_of 4321)"
add_holder odd 12 Second "$(hash_of 4321)"
add_holder odd 13 Fine "$(hash_of 1111)"
# "Another task got there first": the later patient already holds it.
add_holder odd 21 Earlier "$(hash_of 2468)"
add_holder odd 22 Later "$(hash_of 2468)" "$(app_fingerprint 2468)"
H31="$(hash_of 12345)" # five digits: none of the 10,000
add_holder odd 31 Fivedigits "$H31"
add_holder odd 32 Nothash "made-up-hash-not-a-real-bcrypt-value"
add_holder odd 33 Costly "$(hash_of 1111 | sed 's/^\$2b\$04\$/$2b$12$/')"
add_holder odd 34 Empty "x"
sql odd "update public.patients set pin = '' where id = '$(pin_id 34)'"
add_holder odd 35 Last "$(hash_of 2222)"

out="$(stamp odd stamp 2>&1)" || fail "stamp-pins.sh must finish when some holders cannot be stamped: $out"
same "all nine without a fingerprint were looked at, once" "$(says "$out" seen)" "9"
same "four got theirs" "$(says "$out" stamped)" "4"
same "one of them took it over from a later patient" "$(says "$out" took_over)" "1"
same "one shares a PIN with an earlier patient" "$(says "$out" same_pin)" "1"
same "one hash matched no PIN" "$(says "$out" no_match)" "1"
same "three are not hashes the job works on" "$(says "$out" unusable)" "3"
same "the earlier of two with one PIN has the fingerprint" "$(lookup_of odd 11)" "$(app_fingerprint 4321)"
same "the later one has none" "$(lookup_of odd 12)" ""
same "the one after them was not lost" "$(lookup_of odd 13)" "$(app_fingerprint 1111)"
same "the earlier patient takes the fingerprint over" "$(lookup_of odd 21)" "$(app_fingerprint 2468)"
same "and the later one is left without" "$(lookup_of odd 22)" ""
same "a hash no PIN matches is left alone" "$(lookup_of odd 31)|$(pin_of odd 31)" "|$H31"
same "what is not a hash is left alone" "$(lookup_of odd 32)$(lookup_of odd 33)$(lookup_of odd 34)" ""
same "the holder after all of those is stamped" "$(lookup_of odd 35)" "$(app_fingerprint 2222)"
same "one fingerprint, one patient" \
  "$(sql odd "select count(*) - count(distinct pin_lookup) from public.patients where pin_lookup is not null")" "0"
no_patient_data "stamp, with holders it cannot stamp" "$out" odd 4321 1111 2468 12345 2222
ok "two patients with one PIN: the first by id gets the fingerprint, the other is counted, nobody else is lost"
ok "a hash no PIN matches, and values that are not hashes, are counted and passed over"

after_odd="$(pins_state odd)"
out="$(stamp odd stamp 2>&1)" || fail "stamp-pins.sh, again with holders it cannot stamp: $out"
same "a later run tries the six again" "$(says "$out" seen)" "6"
same "and stamps none" "$(says "$out" stamped)" "0"
same "both later patients of a shared PIN are counted" "$(says "$out" same_pin)" "2"
same "the unmatched hash is tried again, once" "$(says "$out" no_match)" "1"
same "nothing changed" "$(pins_state odd)" "$after_odd"
out="$(stamp odd count 2>&1)" || fail "stamp-pins.sh count, with holders it cannot stamp: $out"
echo "$out" | grep -qx "stamp-pins count: pin_holders=10 current=4 without=6 never_stamped=6 other_key=0 unusable=3" \
  || fail "count must say six are left, three of them unusable; it said: $out"
ok "a later run tries them again and settles the same way"

# 4. The kiosk in use while the job runs. A stand-in psql lets the test
#    act between the job's read and its first write: by then one patient
#    has had their PIN reset by staff, one has chosen a new PIN, one was
#    stamped by the app, one got a new PIN from code that knows nothing
#    of fingerprints. None of the four writes may land.
new_pins_db race
add_signed_in race
add_holder race 41 Reset "$(hash_of 1010)"
add_holder race 42 Newpin "$(hash_of 2020)"
add_holder race 43 Signedin "$(hash_of 3030)"
add_holder race 44 Plainwrite "$(hash_of 5050)"
NEW42="$(hash_of 9090)"
NEW44="$(hash_of 6060)"
cat > "$DIR/meanwhile.sql" <<SQL
update public.patients set pin = null where id = '$(pin_id 41)';
update public.patients set pin = '$NEW42', pin_lookup = '$(app_fingerprint 9090)' where id = '$(pin_id 42)';
update public.patients set pin_lookup = '$(app_fingerprint 3030)' where id = '$(pin_id 43)';
update public.patients set pin = '$NEW44' where id = '$(pin_id 44)';
SQL
# The job's calls: 1 its look at the secret's evidence, 2 the read, 3 the
# first write.
RACE="$(stand_in race 3 "\"$REAL_PSQL\" -U postgres -X -q -v ON_ERROR_STOP=1 -d race -f \"$DIR/meanwhile.sql\" >/dev/null")"
out="$(PATH="$RACE:$PATH" stamp race stamp 2>&1)" || fail "stamp-pins.sh while the kiosk is in use: $out"
same "all four were looked at" "$(says "$out" seen)" "4"
same "none was stamped by the job" "$(says "$out" stamped)" "0"
same "all four had changed meanwhile" "$(says "$out" changed)" "4"
same "a PIN reset by staff stays reset" "$(pin_of race 41)|$(lookup_of race 41)" "|"
same "a new PIN keeps its own fingerprint" "$(pin_of race 42)|$(lookup_of race 42)" "$NEW42|$(app_fingerprint 9090)"
same "a patient the app stamped keeps that" "$(lookup_of race 43)" "$(app_fingerprint 3030)"
same "a new PIN written without a fingerprint gets none from the old PIN" "$(pin_of race 44)|$(lookup_of race 44)" "$NEW44|"
ok "a PIN reset, a new PIN or a sign-in between the job's read and its write is never overwritten"

# Hashes and ids travel through pipes: nothing of a patient's is ever an
# argument of a program (where other programs could read it).
while read -r secret; do
  if grep -qF -- "$secret" "$RACE/calls"; then
    fail "the job put something of a patient's on psql's command line"
  fi
done < <(
  sql race "select id::text from public.patients"
  sql race "select pin from public.patients where pin is not null"
  sql race "select pin_lookup from public.patients where pin_lookup is not null"
  echo "$SECRET"
)
same "psql was called for the evidence, the read, each write and the last look" \
  "$(wc -l < "$RACE/calls" | tr -d ' ')" "7"
ok "nothing of a patient's, and not the secret, is ever on a command line"

# The next run finds 44's new PIN, which nobody has stamped.
out="$(stamp race stamp 2>&1)" || fail "stamp-pins.sh after the kiosk scene: $out"
same "a new PIN written without a fingerprint is stamped by the next run" \
  "$(lookup_of race 44)" "$(app_fingerprint 6060)"

# The same, with the change still IN FLIGHT when the job writes: a
# transaction has replaced the PIN and not yet committed. The job's write
# must wait for it and then see the new PIN — which is why it locks the
# row before deciding (`for update`). Looking without the lock, it would
# see the old PIN, wait only at the write, and put the OLD PIN's
# fingerprint on the NEW PIN: a patient the kiosk can never find.
new_pins_db inflight
add_signed_in inflight
add_holder inflight 45 Midway "$(hash_of 1010)"
NEW45="$(hash_of 7070)"
cat > "$DIR/inflight.sql" <<SQL
begin;
update public.patients set pin = '$NEW45' where id = '$(pin_id 45)';
select pg_sleep(2);
commit;
SQL
cat > "$DIR/inflight.sh" <<INFLIGHT
"$REAL_PSQL" -U postgres -X -q -v ON_ERROR_STOP=1 -d inflight -f "$DIR/inflight.sql" >/dev/null 2>&1 &
# Go on only once that transaction holds the row.
for _ in \$(seq 1 100); do
  [ "\$("$REAL_PSQL" -U postgres -X -q -At -d inflight -c "select count(*) from pg_stat_activity where datname = 'inflight' and query like '%pg_sleep%' and pid <> pg_backend_pid()")" = "1" ] && break
  sleep 0.05
done
INFLIGHT
INFLIGHT="$(stand_in inflight 3 "bash \"$DIR/inflight.sh\"")"
out="$(PATH="$INFLIGHT:$PATH" stamp inflight stamp 2>&1)" || fail "stamp-pins.sh while a PIN change is in flight: $out"
same "the one holder was looked at" "$(says "$out" seen)" "1"
same "and found changed" "$(says "$out" changed)" "1"
same "nothing was stamped" "$(says "$out" stamped)" "0"
same "the new PIN is in place, with no fingerprint from the old one" \
  "$(pin_of inflight 45)|$(lookup_of inflight 45)" "$NEW45|"
ok "a PIN change still in flight when the job writes: the job waits, sees the new PIN and stores nothing"

# A database error is shown as its code alone. Here Postgres's own text
# would quote the row (a made-up trigger that fails with the hash in its
# message).
new_pins_db loud
add_signed_in loud
HLOUD="$(hash_of 7777)"
add_holder loud 51 Loud "$HLOUD"
sql loud "create function public.stamp_test_loud() returns trigger language plpgsql as \$f\$ begin raise exception 'refused % %', new.pin, new.first_name using detail = new.pin_lookup; end \$f\$"
sql loud "create trigger stamp_test_loud before update on public.patients for each row execute function public.stamp_test_loud()"
if out="$(stamp loud stamp 2>&1)"; then
  fail "stamp-pins.sh must fail when the database refuses a write"
fi
echo "$out" | grep -q "^stamp-pins task 1/1 stopped: database error P0001" || fail "the error must be shown as its code, on a line that says 'stopped:': $out"
no_patient_data "a failed stamp" "$out" loud 7777
case "$out" in *refused* | *"$HLOUD"*) fail "a failed stamp printed Postgres's own words: $out" ;; esac
same "nothing was written" "$(lookup_of loud 51)" ""
ok "a database error stops the task and is shown as its code alone"

if out="$(stamp bare count 2>&1)"; then
  fail "stamp-pins.sh count must fail on a database without the patients table"
fi
echo "$out" | grep -q "^stamp-pins count: stopped: database error 42P01" || fail "a missing table must be shown as its code, on a line that says 'stopped:': $out"
if out="$(PGPORT=1 stamp pins count 2>&1)"; then
  fail "stamp-pins.sh must fail when the database cannot be reached"
fi
echo "$out" | grep -q "the database could not be reached" || fail "an unreachable database must be said plainly: $out"
case "$out" in *127.0.0.1* | *ops_admin*) fail "an unreachable database printed psql's own words: $out" ;; esac
ok "a missing table and an unreachable database are errors, said without psql's own words"

# 5. Shares. Three tasks, each on its own copy of the same twelve
#    holders: every holder is in exactly one task's share.
new_pins_db shares_seed
add_signed_in shares_seed
n=60
for pin in 1111 2222 3333 4444 5555 6666 7777 8888 9999 1212 1313 1414; do
  n=$((n + 1))
  add_holder shares_seed "$n" "Share$n" "$(hash_of "$pin")"
done
taken=""
total=0
for index in 0 1 2; do
  sql postgres "create database shares_$index template shares_seed owner ops_admin" >/dev/null
  out="$(CLOUD_RUN_TASK_INDEX="$index" CLOUD_RUN_TASK_COUNT=3 STAMP_CHUNK=2 stamp "shares_$index" stamp 2>&1)" \
    || fail "stamp-pins.sh as task $index of 3: $out"
  echo "$out" | grep -q "^stamp-pins task $((index + 1))/3 done: " || fail "task $index of 3 must say which task it is: $out"
  mine="$(sql "shares_$index" "select id from public.patients where pin_lookup is not null and id <> '$(pin_id "$SIGNED_IN")' order by id")"
  same "task $index of 3 stamped everyone it looked at" "$(says "$out" stamped)" "$(says "$out" seen)"
  same "task $index of 3 looked at its share and nobody else" "$(says "$out" seen)" "$(printf '%s\n' "$mine" | grep -c . || true)"
  total=$((total + $(says "$out" seen)))
  taken="$taken$mine
"
done
same "the three shares hold all twelve holders" "$total" "12"
same "no holder is in two shares" "$(printf '%s' "$taken" | grep . | sort | uniq -d | wc -l | tr -d ' ')" "0"
same "every holder is in one" "$(printf '%s' "$taken" | grep . | sort -u | wc -l | tr -d ' ')" "12"
ok "three tasks: every holder is in exactly one task's share"

# Three tasks AT THE SAME TIME on one database, as Cloud Run runs them —
# and every PIN is held by two patients (61–66, and again 71–76), most
# pairs split between two tasks. Each holder takes a couple of seconds
# to work out, so the tasks are in each other's way for real: some later
# patients are reached first and lose the fingerprint again. Whatever the
# order, the end is the same: the first by id of each pair holds it.
new_pins_db together
add_signed_in together
n=60
TOGETHER_PINS="1358 1462 1573 1687 1746 1839"
for pin in $TOGETHER_PINS; do
  n=$((n + 1))
  add_holder together "$n" "First$n" "$(hash_of "$pin")"
  add_holder together "$((n + 10))" "Second$n" "$(hash_of "$pin")"
done
pids=""
for index in 0 1 2; do
  CLOUD_RUN_TASK_INDEX="$index" CLOUD_RUN_TASK_COUNT=3 STAMP_CHUNK=2 \
    stamp together stamp > "$DIR/together.$index" 2>&1 &
  pids="$pids $!"
done
for pid in $pids; do
  wait "$pid" || fail "a task failed when three ran at the same time: $(cat "$DIR"/together.*)"
done
working=0
for index in 0 1 2; do
  [ "$(says "$(cat "$DIR/together.$index")" seen)" = "0" ] || working=$((working + 1))
done
same "at least two of the three tasks had holders to work on" "$([ "$working" -ge 2 ] && echo yes)" "yes"
n=60
for pin in $TOGETHER_PINS; do
  n=$((n + 1))
  same "the first patient with PIN $pin holds its fingerprint" "$(lookup_of together "$n")" "$(app_fingerprint "$pin")"
  same "the second patient with PIN $pin holds none" "$(lookup_of together "$((n + 10))")" ""
done
# shellcheck disable=SC2086
no_patient_data "three tasks at the same time" "$(cat "$DIR"/together.*)" together $TOGETHER_PINS
ok "three tasks at the same time, every PIN shared by two patients: the first by id ends up with each fingerprint"

out="$(CLOUD_RUN_TASK_INDEX=1 CLOUD_RUN_TASK_COUNT=3 stamp pins count 2>&1)" || fail "count as task 1 of 3: $out"
case "$out" in *pin_holders=*) fail "only the first task counts; task 2 of 3 printed: $out" ;; esac
out="$(CLOUD_RUN_TASK_INDEX=0 CLOUD_RUN_TASK_COUNT=3 stamp pins count 2>&1)" || fail "count as task 0 of 3: $out"
echo "$out" | grep -q "pin_holders=5 current=5 without=0" || fail "the first of three tasks must count: $out"
ok "count, run as several tasks, is printed once"

before="$(pins_state odd)"
if out="$(CLOUD_RUN_TASK_INDEX=3 CLOUD_RUN_TASK_COUNT=3 stamp odd stamp 2>&1)"; then
  fail "stamp-pins.sh must refuse a task index outside its count"
fi
if out="$(CLOUD_RUN_TASK_INDEX=1 stamp odd stamp 2>&1)"; then
  fail "stamp-pins.sh must refuse a task index without a count"
fi
if out="$(STAMP_CHUNK=0 stamp odd stamp 2>&1)"; then
  fail "stamp-pins.sh must refuse a chunk size of 0"
fi
same "a refused task changed nothing" "$(pins_state odd)" "$before"
ok "a task that cannot tell its share refuses to run"

# 6. Without the secret there is no key: nothing may be counted as
#    "current" or stamped under an empty one.
for mode in count stamp stamp-after-new-secret; do
  if out="$(PGDATABASE=odd bash "$STAMP_PINS" "$mode" 2>&1)"; then
    fail "stamp-pins.sh $mode must refuse to run without NEXTAUTH_SECRET"
  fi
  echo "$out" | grep -q "stopped: NEXTAUTH_SECRET is not set" || fail "the refusal must say why, on a line that says 'stopped:': $out"
  if out="$(PGDATABASE=odd NEXTAUTH_SECRET="" bash "$STAMP_PINS" "$mode" 2>&1)"; then
    fail "stamp-pins.sh $mode must refuse to run with an empty NEXTAUTH_SECRET"
  fi
  if out="$(PGDATABASE=odd node "$STAMP_DIR/stamp-pins.mjs" "$mode" 2>&1)"; then
    fail "stamp-pins.mjs $mode, run by itself, must refuse to run without NEXTAUTH_SECRET"
  fi
done
same "nothing was stamped without the secret" "$(pins_state odd)" "$before"
ok "count, stamp and stamp-after-new-secret refuse to run without NEXTAUTH_SECRET"

for bad in "" "sideways" "stamp extra" "count stamp" "stamp-after" "stamp-after-new-secret now"; do
  # shellcheck disable=SC2086
  if out="$(stamp odd $bad 2>&1)"; then
    fail "stamp-pins.sh must refuse: '$bad'"
  fi
done
same "a refused command changed nothing" "$(pins_state odd)" "$before"
ok "stamp-pins.sh refuses an argument it does not know"

# ------------------------------------------------------------- set-secret
# deploy/ops/set-secret.sh, with a stand-in for gcloud that keeps what it
# is given in a folder: no Google account is involved, and nothing real
# is stored anywhere.
STORE="$DIR/secrets"
mkdir -p "$DIR/bin" "$STORE"
cat > "$DIR/bin/gcloud" <<'GCLOUD'
#!/usr/bin/env bash
# Stand-in gcloud: secrets list | create | versions add | versions list.
# A file named "refuse" makes it refuse a new value; "cannot-list" makes
# both list commands fail, as when not signed in; "cannot-list-versions"
# only the second.
set -euo pipefail
printf '%s\n' "$*" >> "$STORE/calls"
[ "$1" = "secrets" ] || exit 64
case "$2" in
  list)
    [ ! -e "$STORE/cannot-list" ] || exit 1
    for secret in "$STORE"/*/; do
      [ -d "$secret" ] && echo "projects/123456/secrets/$(basename "$secret")"
    done
    exit 0
    ;;
  create) mkdir "$STORE/$3" ;;
  versions)
    case "$3" in
      add)
        [ -d "$STORE/$4" ] || exit 1
        [ "$5" = "--data-file=-" ] || exit 64
        [ ! -e "$STORE/refuse" ] || exit 1
        n=$(($(ls "$STORE/$4" | wc -l) + 1))
        cat > "$STORE/$4/$n"
        ;;
      list)
        [ ! -e "$STORE/cannot-list" ] || exit 1
        [ ! -e "$STORE/cannot-list-versions" ] || exit 1
        [ -d "$STORE/$4" ] && [ -n "$(ls "$STORE/$4")" ] && echo 1 || true
        ;;
      *) exit 64 ;;
    esac
    ;;
  *) exit 64 ;;
esac
GCLOUD
chmod +x "$DIR/bin/gcloud"
set_secret() {
  STORE="$STORE" PATH="$DIR/bin:$PATH" bash deploy/ops/set-secret.sh "$@"
}
versions() { # versions <name> — how many values the stand-in holds
  ls "$STORE/$1" 2>/dev/null | wc -l | tr -d ' '
}

out="$(set_secret random made-up-one 2>&1)" || fail "set-secret random: $out"
value="$(cat "$STORE/made-up-one/1")"
same "random stores 64 letters and digits" \
  "$(printf '%s' "$value" | grep -c '^[0-9a-f]\{64\}$')" "1"
same "and no line end after them" "$(wc -c < "$STORE/made-up-one/1" | tr -d ' ')" "64"
case "$out" in *"$value"*) fail "set-secret random printed the value" ;; esac
if grep -q "$value" "$STORE/calls"; then
  fail "set-secret random put the value on a command line"
fi
same "it says what it stored, not the value" "$out" "stored: made-up-one (64 characters)"
ok "set-secret random: stores a strong value, shows only its name and length"

if out="$(set_secret random made-up-one 2>&1)"; then
  fail "set-secret random must not replace a value unasked"
fi
same "the value was left alone" "$(versions made-up-one)" "1"
out="$(set_secret random made-up-one --replace 2>&1)" || fail "set-secret random --replace: $out"
same "--replace adds a new value" "$(versions made-up-one)" "2"
[ "$(cat "$STORE/made-up-one/2")" != "$value" ] || fail "--replace stored the same value again"
ok "set-secret random: refuses to replace a value unless given --replace"

out="$(printf '  pasted-made-up-value \n' | set_secret ask made-up-two 2>&1)" \
  || fail "set-secret ask: $out"
same "ask stores what was typed, without the spaces and line end around it" \
  "$(cat "$STORE/made-up-two/1")" "pasted-made-up-value"
same "and nothing after it" "$(wc -c < "$STORE/made-up-two/1" | tr -d ' ')" "20"
case "$out" in *pasted-made-up-value*) fail "set-secret ask printed the value" ;; esac
if grep -q "pasted-made-up-value" "$STORE/calls"; then
  fail "set-secret ask put the value on a command line"
fi
out="$(printf 'second-made-up-value\n' | set_secret ask made-up-two 2>&1)" \
  || fail "set-secret ask, again: $out"
same "ask again adds a new value" "$(cat "$STORE/made-up-two/2")" "second-made-up-value"
if out="$(printf '   \n' | set_secret ask made-up-three 2>&1)"; then
  fail "set-secret ask must refuse an empty value"
fi
same "nothing was created for an empty value" "$(versions made-up-three)" "0"
ok "set-secret ask: stores the typed value, never shows it, refuses an empty one"

out="$(printf 'postgres://authenticator:%s@127.0.0.1:5432/rac' "$value" | set_secret stdin made-up-four 2>&1)" \
  || fail "set-secret stdin: $out"
same "stdin stores exactly what another command hands it" \
  "$(cat "$STORE/made-up-four/1")" "postgres://authenticator:$value@127.0.0.1:5432/rac"
case "$out" in *"$value"*) fail "set-secret stdin printed the value" ;; esac
ok "set-secret stdin: stores a value composed by another command"

calls_before="$(wc -l < "$STORE/calls" | tr -d ' ')"
for bad in "" "random" "sideways made-up" "random Made_Up" "random made-up --force" \
  "ask made-up extra" "random --replace"; do
  # shellcheck disable=SC2086
  if out="$(printf 'x\n' | set_secret $bad 2>&1)"; then
    fail "set-secret must refuse: '$bad'"
  fi
done
same "a refused command reaches nothing" "$(wc -l < "$STORE/calls" | tr -d ' ')" "$calls_before"
ok "set-secret refuses arguments it does not know"

# "Could not ask" is never taken for "nothing there yet": a failed
# question must not let `random` replace a value, or anything be stored.
touch "$STORE/cannot-list"
if out="$(set_secret random made-up-one 2>&1)"; then
  fail "set-secret random must refuse when it cannot ask what is there"
fi
case "$out" in *"could not ask"*) ;; *) fail "set-secret random failed for another reason: $out" ;; esac
same "the value was left alone when gcloud could not answer" "$(versions made-up-one)" "2"
if out="$(printf 'x-made-up\n' | set_secret ask made-up-six 2>&1)"; then
  fail "set-secret ask must refuse when it cannot ask what is there"
fi
same "nothing was created when gcloud could not answer" "$(versions made-up-six)" "0"
rm "$STORE/cannot-list"
# The same, when only the question about the secret's values fails.
touch "$STORE/cannot-list-versions"
if out="$(set_secret random made-up-one 2>&1)"; then
  fail "set-secret random must refuse when it cannot see the secret's values"
fi
case "$out" in *"could not find out"*) ;; *) fail "set-secret random failed for another reason: $out" ;; esac
rm "$STORE/cannot-list-versions"
same "the value was left alone when its versions could not be listed" "$(versions made-up-one)" "2"
ok "set-secret stores nothing when gcloud cannot say what is already there"

touch "$STORE/refuse"
if out="$(set_secret random made-up-five 2>&1)"; then
  fail "set-secret must fail when Secret Manager refuses the value"
fi
case "$out" in *stored:*) fail "set-secret said 'stored' although it was refused" ;; esac
rm "$STORE/refuse"
ok "set-secret fails, and does not say 'stored', when the value is refused"

# --------------------------------------------------------- render-service
# deploy/render-service.sh only writes text; made-up names throughout.
render() {
  PROJECT_ID="${PROJECT_ID-made-up-project}" \
    IMAGE="${IMAGE-us-west1-docker.pkg.dev/made-up-project/rac/web:b1}" \
    POSTGREST_IMAGE=us-west1-docker.pkg.dev/made-up-project/rac/postgrest:v1 \
    NEXTAUTH_URL=https://new.example.com bash deploy/render-service.sh
}
out="$(render 2>&1)" || fail "render-service.sh: $out"
if printf '%s\n' "$out" | grep -v '^[[:space:]]*#' | grep -q '\${'; then
  fail "render-service.sh left a \${…} name unfilled"
fi
for line in \
  "serviceAccountName: rac-app@made-up-project.iam.gserviceaccount.com" \
  "image: us-west1-docker.pkg.dev/made-up-project/rac/web:b1" \
  "image: us-west1-docker.pkg.dev/made-up-project/rac/postgrest:v1" \
  "value: https://new.example.com" \
  "- made-up-project:us-west1:rac-db" \
  'run.googleapis.com/invoker-iam-disabled: "true"' \
  "run.googleapis.com/ingress: internal-and-cloud-load-balancing"; do
  printf '%s\n' "$out" | grep -qF -- "$line" || fail "the rendered service lacks: $line"
done
if printf '%s\n' "$out" | grep -v '^[[:space:]]*#' | grep -q 'PGRST_DB_ANON_ROLE'; then
  fail "the service must not give PostgREST an anonymous role"
fi
if out="$(PROJECT_ID="" render 2>&1)"; then
  fail "render-service.sh must refuse to run without PROJECT_ID"
fi
if out="$(IMAGE='x|y' render 2>&1)"; then
  fail "render-service.sh must refuse a value with unexpected characters"
fi
ok "render-service.sh fills in every name, and refuses a missing or odd value"

# ---------------------------------------------------------------- runbook
# deploy/RUNBOOK.md is pasted into zsh, command by command. Two things
# that are fine in bash are not there, and each has already broken a
# command once:
#  - a name without braces followed by ":r…" — zsh takes ":r" for a
#    modifier and rewrites the text ("<project>:<region>:rac-db" lost
#    two letters, and gcloud refused the result). So every name the
#    shell fills in is written ${NAME};
#  - a "#" note inside a command block — zsh does not treat it as a
#    comment when pasted: a note after a command becomes arguments.
bare="$(grep -nE '\$[A-Za-z_]' deploy/RUNBOOK.md || true)"
[ -z "$bare" ] || fail "deploy/RUNBOOK.md: write every name the shell fills in as \${NAME}:
$bare"
notes="$(awk '/^ *```sh/ { inside = 1; next } /^ *```/ { inside = 0 } inside && /(^|[ \t])#/ { print NR ": " $0 }' deploy/RUNBOOK.md)"
[ -z "$notes" ] || fail "deploy/RUNBOOK.md: a # note inside a command block (zsh would run it):
$notes"
same "the runbook still has command blocks to check" \
  "$([ "$(grep -c '^ *```sh' deploy/RUNBOOK.md)" -ge 10 ] && echo yes)" "yes"
ok "the runbook's commands are written for zsh: \${NAME} everywhere, no notes inside command blocks"
