#!/usr/bin/env bash
# Moves the clinic's rows from the database being left (Supabase) into the
# new one (Cloud SQL), or empties the new one again after a rehearsal.
#
#   copy-data.sh copy    replace the nine tables' rows with the source's
#   copy-data.sh empty   remove the nine tables' rows
#
# The destination is found through libpq's own variables (PGHOST, PGPORT,
# PGUSER, PGPASSWORD, PGDATABASE); connect as the role that owns the
# tables. `copy` also needs SOURCE_DATABASE_URL, the source's connection
# address. The destination must already be built (migrate.sh).
#
# Rows go from one database straight into the other. This script prints
# one line per table — "<table> source=<n> dest=<n> ok" or "… MISMATCH" —
# and NEVER a row; errors are shown as their code alone, because
# Postgres's own error text can quote the row it stopped at. Exit 1 if
# any count differs.
#
# `copy` is one transaction on the destination: empty the nine tables,
# load them, clear Spotify's connection, commit. If anything fails —
# source unreachable, a row the destination refuses — nothing is
# committed and the destination is exactly as it was. Running it twice
# gives the same result as running it once: the destination equals the
# source, with no duplicates and no leftovers.
#
# The counts are read after the copy. If the source is still being
# written to, a row can arrive in between and show as a MISMATCH: run it
# again. (At the switch the old site is stopped first.)
#
# Tested by scripts/test-ops.sh (npm run test:ops).
set -euo pipefail

# Copied. A new table that must move goes in this list.
TABLES=(
  patients
  rooms
  doctors
  checkins
  display_devices
  kiosk_devices
  waiting_room_music
  radio_stations
  staff_audit_log
)
# Not copied — short-lived, rebuilt by use: pin_attempt_failures,
# form_submission_events, day_schedule_cache.

usage() {
  echo "usage: copy-data.sh copy | empty" >&2
  exit 2
}
[ "$#" -eq 1 ] || usage

# The destination. VERBOSITY=sqlstate: see the note on errors above.
dest() {
  psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate "$@"
}
# The source: its address says everything, so the destination's settings
# (its password above all) are kept away from it.
at_source() {
  env -u PGHOST -u PGPORT -u PGUSER -u PGPASSWORD -u PGDATABASE \
    -u PGOPTIONS "$@"
}

# One statement for all nine: no CASCADE, so a table that points at one
# of these and is not in the list stops the copy instead of being emptied
# unasked. Identity counters start again; a copy sets them from the source.
qualified=""
for t in "${TABLES[@]}"; do
  qualified="$qualified${qualified:+, }public.$t"
done
TRUNCATE="truncate table $qualified restart identity;"

# Row counts of the nine tables, one number per line, in TABLES order.
COUNT_SQL=""
n=0
for t in "${TABLES[@]}"; do
  n=$((n + 1))
  COUNT_SQL="$COUNT_SQL${COUNT_SQL:+ union all }select $n as n, count(*) as c from public.$t"
done
COUNT_SQL="select c from ($COUNT_SQL) counted order by n"

case "$1" in
  empty)
    dest -c "$TRUNCATE" >/dev/null
    dest_counts="$(dest -At -c "$COUNT_SQL")"
    i=0
    status=0
    while read -r count; do
      echo "${TABLES[$i]} dest=$count"
      [ "$count" = "0" ] || status=1
      i=$((i + 1))
    done <<<"$dest_counts"
    exit "$status"
    ;;

  copy)
    : "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is not set}"

    dump=(pg_dump --data-only --no-owner --no-privileges)
    for t in "${TABLES[@]}"; do
      dump+=("--table=public.$t")
    done

    # One stream into one psql. "commit" is written only if pg_dump
    # finished cleanly; without it the transaction ends with the
    # connection and everything is rolled back.
    if ! (
      echo "begin;"
      echo "$TRUNCATE"
      at_source "${dump[@]}" --dbname="$SOURCE_DATABASE_URL" || exit 1
      # The token was sealed with the old NEXTAUTH_SECRET; the new one
      # cannot open it. Staff connect Spotify again from the dashboard.
      echo "update public.waiting_room_music set spotify_refresh_token = null, spotify_account_name = null, spotify_connected_at = null;"
      echo "commit;"
    ) | dest >/dev/null; then
      echo "copy failed: nothing was committed, the destination is as it was" >&2
      exit 1
    fi

    source_counts="$(at_source psql -X -q -At -v ON_ERROR_STOP=1 \
      -v VERBOSITY=sqlstate --dbname="$SOURCE_DATABASE_URL" -c "$COUNT_SQL")"
    dest_counts="$(dest -At -c "$COUNT_SQL")"

    i=0
    status=0
    while read -r source_count dest_count; do
      if [ "$source_count" = "$dest_count" ]; then
        verdict=ok
      else
        verdict=MISMATCH
        status=1
      fi
      echo "${TABLES[$i]} source=$source_count dest=$dest_count $verdict"
      i=$((i + 1))
    done < <(paste -d ' ' <(echo "$source_counts") <(echo "$dest_counts"))
    exit "$status"
    ;;

  *)
    usage
    ;;
esac
