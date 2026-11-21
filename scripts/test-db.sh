#!/usr/bin/env bash
# Runs supabase/tests/*.sql against a throwaway local Postgres with every
# migration applied. Needs Postgres installed (initdb, pg_ctl, psql) —
# nothing is sent to Supabase. Usage: npm run test:db
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${TEST_DB_PORT:-54329}"
DIR="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

initdb -D "$DIR" -U postgres >/dev/null
# TCP only: a temp path can be too long for a unix socket.
pg_ctl -D "$DIR" -w -l "$DIR/log" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  start >/dev/null

run() {
  psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q "$@"
}

for migration in supabase/migrations/*.sql; do
  run -f "$migration" >/dev/null
done

for test in supabase/tests/*.sql; do
  run -f "$test" >/dev/null
  echo "ok  $test"
done
