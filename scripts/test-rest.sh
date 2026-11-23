#!/usr/bin/env bash
# Runs the app's own queries against a real PostgREST and Postgres — the
# versions pinned in deploy/versions.env, in Docker, built the way the
# Google Cloud side is built (deploy/ops/migrate.sh). Made-up rows only;
# nothing leaves this computer, and the stack is thrown away afterwards.
# Needs Docker running. Usage: npm run test:rest
set -euo pipefail

cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. deploy/versions.env
set +a

random() {
  node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))'
}
# Made up for this run and gone with it.
export AUTHENTICATOR_PASSWORD="$(random)"
export PGRST_JWT_SECRET="$(random)"

REST=http://127.0.0.1:54331
compose() {
  docker compose -p rac-test-rest -f deploy/local/docker-compose.yml "$@"
}
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "--- PostgREST's last lines:" >&2
    compose logs --no-log-prefix --tail 30 rest >&2 2>/dev/null || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

ok() {
  echo "ok  $1"
}
fail() {
  echo "FAILED  $1" >&2
  exit 1
}
migrate() {
  compose exec -T -e AUTHENTICATOR_PASSWORD db bash /repo/deploy/ops/migrate.sh
}
admin_sql() {
  compose exec -T db psql -X -q -At -v ON_ERROR_STOP=1 -c "$1"
}
# status <path> [token] — the HTTP status PostgREST answers with.
status() {
  if [ -n "${2:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $2" "$REST$1"
  else
    curl -s -o /dev/null -w '%{http_code}' "$REST$1"
  fi
}

compose down --volumes --remove-orphans >/dev/null 2>&1 || true
compose up -d --wait db >/dev/null 2>&1 || fail "Postgres $POSTGRES_MAJOR did not start"
out="$(migrate 2>&1)" || fail "migrate.sh against Postgres $POSTGRES_MAJOR: $out"
echo "$out" | grep -q '^applied 0001_' || fail "migrate.sh applied nothing: $out"
ok "Postgres $POSTGRES_MAJOR is built by migrate.sh ($(admin_sql 'show server_version'))"

compose up -d --wait rest >/dev/null 2>&1 || fail "PostgREST $POSTGREST_VERSION did not become ready"
ok "PostgREST $POSTGREST_VERSION is ready"

# The token the app will carry, minted the way the runbook mints it.
if printf 'too-short' | node scripts/mint-db-jwt.js >/dev/null 2>&1; then
  fail "mint-db-jwt.js must refuse a secret shorter than 32 characters"
fi
DB_REST_JWT="$(printf '%s' "$PGRST_JWT_SECRET" | node scripts/mint-db-jwt.js)"
[ "$(status /rooms "$DB_REST_JWT")" = "200" ] || fail "the minted token is not accepted"
[ "$(status /rooms)" = "401" ] || fail "a request without a token must be refused"
ok "mint-db-jwt.js: its token is accepted; a short secret is refused"

# A table added by a later migration must work for the app once
# migrate.sh has run — without restarting PostgREST, which keeps its own
# picture of the database.
admin_sql "create table public.later_table (id int primary key)"
out="$(migrate 2>&1)" || fail "migrate.sh after a new table: $out"
seen=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  seen="$(status /later_table "$DB_REST_JWT")"
  [ "$seen" = "200" ] && break
  sleep 1
done
[ "$seen" = "200" ] || fail "a table added later is not served after migrate.sh (HTTP $seen)"
admin_sql "drop table public.later_table"
migrate >/dev/null 2>&1
ok "a table added later is served after migrate.sh, with no restart"

DB_REST_URL="$REST" DB_REST_JWT="$DB_REST_JWT" \
  npx vitest run --config vitest.integration.config.ts
