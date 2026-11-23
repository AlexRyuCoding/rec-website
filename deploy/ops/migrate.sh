#!/usr/bin/env bash
# Builds a Postgres database that is not Supabase's (Cloud SQL), or brings
# it up to date. Safe to run again at any time; it takes no arguments.
#
#   1. roles            supabase/cloud-sql/roles.sql
#   2. authenticator's password, from AUTHENTICATOR_PASSWORD
#   3. migrations       supabase/migrations/*.sql, in name order — only
#                       those not yet recorded in ops.schema_migrations
#   4. grants           supabase/cloud-sql/grants.sql — every time, so a
#                       table added by a new migration works for the app
#
# The database is found through libpq's own variables: PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE. Connect as the role that owns the tables
# (the database's administrator), not as the app's role.
#
# Prints "applied <file>" for each migration it ran, or "nothing to
# apply". Stops at the first error with a non-zero exit. A migration is
# applied in one transaction together with its record: it is either
# recorded and whole, or not there at all.
#
# Tested by scripts/test-ops.sh (npm run test:ops).
set -euo pipefail

: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD is not set}"
export AUTHENTICATOR_PASSWORD

# The repository's SQL is found relative to this file; ROOT overrides it.
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# Name order must not depend on the machine's language settings.
export LC_ALL=C
# Keep the log to what matters: no "already exists, skipping" notices.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

# VERBOSITY=terse: an error is shown as its message and place, without
# the DETAIL and CONTEXT lines — those can quote a row of a table.
run() {
  psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=terse "$@"
}

run >/dev/null <<'SQL'
create schema if not exists ops;
create table if not exists ops.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
SQL

run -f "$ROOT/supabase/cloud-sql/roles.sql" >/dev/null

# The password goes from the environment into a psql variable inside
# psql itself: it is never on a command line and never printed. (An error
# here is shown as its code alone — the statement is not echoed back.)
run >/dev/null <<'SQL'
\set VERBOSITY sqlstate
\set password `printenv AUTHENTICATOR_PASSWORD`
alter role authenticator password :'password';
SQL

applied=0
for file in "$ROOT"/supabase/migrations/*.sql; do
  if [ ! -f "$file" ]; then
    echo "migrate: no migrations found under $ROOT/supabase/migrations" >&2
    exit 1
  fi
  name="$(basename "$file")"
  # The name is written into a statement below.
  if [[ ! "$name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "migrate: refusing a file name with unusual characters: $name" >&2
    exit 1
  fi
  recorded="$(run -At -c \
    "select count(*) from ops.schema_migrations where filename = '$name'")"
  if [ "$recorded" != "0" ]; then
    continue
  fi
  # -1: the file and its record are one transaction.
  run -1 -f "$file" \
    -c "insert into ops.schema_migrations (filename) values ('$name')" \
    >/dev/null
  echo "applied $name"
  applied=$((applied + 1))
done
if [ "$applied" -eq 0 ]; then
  echo "nothing to apply"
fi

run -f "$ROOT/supabase/cloud-sql/grants.sql" >/dev/null
