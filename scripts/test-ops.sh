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
