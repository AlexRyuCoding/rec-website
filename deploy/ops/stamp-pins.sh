#!/usr/bin/env bash
# Gives every patient who has a PIN the fingerprint the kiosk looks them
# up by (patients.pin_lookup, migration 0017; src/lib/pin-lookup.ts).
#
#   stamp-pins.sh count   how many PIN holders have no current fingerprint,
#                         and roughly how long stamping them takes.
#                         Changes nothing.
#   stamp-pins.sh stamp   work out and store the missing fingerprints.
#
# Why: the app only gives a patient a fingerprint when they next sign in.
# Until every PIN holder has one, any PIN that matches no fingerprint —
# every wrong PIN — is compared against each holder without one, about
# 13 ms apiece: around ten seconds at the kiosk. This does for everyone
# at once what the app does one sign-in at a time. Run it once, and again
# after NEXTAUTH_SECRET is ever replaced (every fingerprint is then out
# of date).
#
# How: a PIN is four digits, so there are 10,000. For each holder the job
# hashes candidates until one matches the stored bcrypt hash — the same
# check the kiosk makes when a PIN is typed — and stores that PIN's
# fingerprint. The comparing runs HERE, on the job's own CPU; the
# database only hands out a few hashes at a time and takes fingerprints
# back. Up to 10,000 compares a holder, about a minute of one CPU.
#
# Nobody's PIN changes and nobody gets a new one. No PIN is written
# anywhere: what is stored is the fingerprint the app would have stored
# itself, and nothing else in the row is touched.
#
# It needs:
#   NEXTAUTH_SECRET   the site's own value — the fingerprint is keyed
#                     with it. Without it the job refuses to run.
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (libpq's variables), as
#                     the role that owns the tables, like migrate.sh.
#
# As a Cloud Run job it can run as several tasks side by side: each takes
# the holders whose id falls in its share (CLOUD_RUN_TASK_INDEX of
# CLOUD_RUN_TASK_COUNT, which Cloud Run sets; with neither, everyone).
#
# What it promises (scripts/test-ops.sh holds each one):
#  - It prints COUNTS ONLY: never a PIN, a hash, a fingerprint, a
#    patient's id or name — errors included, which are shown as the
#    database's code alone.
#  - Hashes leave the database only into this job's memory, through a
#    pipe: never a file, never a command line.
#  - A fingerprint is stored only if the patient's hash is still the one
#    that was read and they still have no current fingerprint. A PIN
#    reset, a new PIN or a sign-in while the job runs always wins.
#  - It can be stopped at any moment and run again: each patient is one
#    small transaction, and a patient already stamped is not read again.
#  - A hash that matches none of the 10,000 (not a 4-digit PIN, or not a
#    hash) and a patient whose PIN another patient also has are counted,
#    left as they are, and looked at again by the next run.
#
# The "done" line of each task:
#   seen       holders without a current fingerprint this task looked at
#   stamped    fingerprints stored (took_over of them: see same_pin)
#   same_pin   left without: an earlier patient has the same PIN. A
#              fingerprint belongs to ONE patient — the one the kiosk
#              finds for that PIN, the first by id. took_over = it was
#              moved to that patient from a later one.
#   no_match   left without: none of the 10,000 PINs gives this hash
#   unusable   left without: not a bcrypt hash of the app's kind
#   changed    left alone: reset, replaced or stamped by the app meanwhile
# A task that fails says "stopped:" and why — an error code, never a row.
#
# The work is deploy/ops/stamp-pins/stamp-pins.mjs (Node, with bcryptjs —
# the library the app hashes PINs with, at the same version).
#
# Tested by scripts/test-ops.sh (npm run test:ops), src/lib/stamp-pins.test.ts
# (npm test) and, signing in through the app as a stamped patient,
# src/lib/stamp-pins.integration.test.ts (npm run test:rest).
set -euo pipefail

usage() {
  echo "usage: stamp-pins.sh count | stamp" >&2
  exit 2
}
[ "$#" -eq 1 ] || usage
case "$1" in
  count | stamp) ;;
  *) usage ;;
esac

# An empty secret would count and stamp under a key nobody uses.
if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  echo "stamp-pins $1: stopped: NEXTAUTH_SECRET is not set" >&2
  exit 1
fi
export NEXTAUTH_SECRET

export LC_ALL=C

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/stamp-pins/stamp-pins.mjs" "$1"
