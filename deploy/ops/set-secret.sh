#!/usr/bin/env bash
# Puts a value into Google Secret Manager without ever showing it.
#
#   set-secret.sh random NAME            make up a strong random value
#   set-secret.sh random NAME --replace  …even though NAME already has one
#   set-secret.sh ask NAME               type or paste the value (hidden)
#   … | set-secret.sh stdin NAME         take the value from another command
#
# NAME is the secret's name (small letters, digits and dashes). The
# secret is created if it does not exist; the value becomes its newest
# version. Uses the gcloud that is signed in on this computer, and the
# project it is set to.
#
# What it never does: print the value, put it on a command line (where
# other programs could read it), or write it to a file. It prints only
# the name and how long the value is, so a paste that went wrong shows.
#
# `random` refuses to replace a value that is already there unless told
# to with --replace. Replacing one is not harmless: running instances keep
# the old value until the next deploy, and some secrets come in pairs
# (db-authenticator-password and pgrst-db-uri; pgrst-jwt-secret and
# db-rest-jwt) — deploy/RUNBOOK.md, "Changing a secret".
#
# Tested with a stand-in gcloud by scripts/test-ops.sh (npm run test:ops).
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: set-secret.sh random NAME [--replace]
       set-secret.sh ask NAME
       … | set-secret.sh stdin NAME
USAGE
  exit 2
}

mode="${1:-}"
name="${2:-}"
replace="${3:-}"
case "$mode" in
  random)
    [ "$#" -eq 2 ] || { [ "$#" -eq 3 ] && [ "$replace" = "--replace" ]; } || usage
    ;;
  ask | stdin)
    [ "$#" -eq 2 ] || usage
    ;;
  *)
    usage
    ;;
esac
if [[ ! "$name" =~ ^[a-z][a-z0-9-]{0,254}$ ]]; then
  echo "set-secret: \"$name\" is not a secret name (small letters, digits and dashes)" >&2
  exit 2
fi

has_value() {
  [ -n "$(gcloud secrets versions list "$name" --filter="state:ENABLED" \
    --limit=1 --format="value(name)" 2>/dev/null)" ]
}

value=""
case "$mode" in
  random)
    if [ "$replace" != "--replace" ] && has_value; then
      echo "set-secret: $name already has a value; it was left alone." >&2
      echo "  To replace it on purpose: set-secret.sh random $name --replace" >&2
      exit 1
    fi
    # 32 random bytes as 64 letters and digits (0-9, a-f): safe inside a
    # connection address, long enough for PostgREST's signing secret.
    value="$(head -c 32 /dev/urandom | od -An -v -tx1 | tr -d ' \n')"
    if [ "${#value}" -ne 64 ]; then
      echo "set-secret: could not make a random value" >&2
      exit 1
    fi
    ;;
  ask)
    printf 'Value for %s (what you type or paste stays hidden), then Enter: ' "$name" >&2
    IFS= read -r -s value || true
    printf '\n' >&2
    ;;
  stdin)
    if [ -t 0 ]; then
      echo "set-secret: \"stdin\" takes the value from another command (… | set-secret.sh stdin $name)." >&2
      echo "  To type or paste it, use: set-secret.sh ask $name" >&2
      exit 2
    fi
    value="$(cat)"
    ;;
esac

if [ "$mode" != "random" ]; then
  # Spaces or line ends around a pasted value are never part of it.
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [ -z "$value" ]; then
    echo "set-secret: no value given; nothing was stored" >&2
    exit 1
  fi
fi

if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
  gcloud secrets create "$name" --replication-policy=automatic >/dev/null
fi
# printf is part of the shell itself: the value goes down the pipe and is
# never an argument of a program.
printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
echo "stored: $name (${#value} characters)"
