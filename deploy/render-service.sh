#!/usr/bin/env bash
# Fills in deploy/service.template.yaml and prints the result — the file
# `gcloud run services replace` takes. It only writes text: it contacts
# nothing and needs no sign-in.
#
#   PROJECT_ID=… IMAGE=… POSTGREST_IMAGE=… NEXTAUTH_URL=… \
#     bash deploy/render-service.sh > /tmp/rac-web.yaml
#
#   PROJECT_ID        the Google Cloud project id
#   IMAGE             the app image, full address with tag or digest
#   POSTGREST_IMAGE   the PostgREST image (the project's own copy)
#   NEXTAUTH_URL      https://new.ryuacupuncture.com while testing,
#                     https://www.ryuacupuncture.com from the switch on
#   REGION            optional, default us-west1
#   SQL_INSTANCE      optional, default rac-db
#
# The Cloud SQL Auth Proxy version comes from deploy/versions.env.
# No secret is involved: the template names secrets, it holds none.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$HERE/versions.env"

: "${PROJECT_ID:?PROJECT_ID is not set}"
: "${IMAGE:?IMAGE is not set}"
: "${POSTGREST_IMAGE:?POSTGREST_IMAGE is not set}"
: "${NEXTAUTH_URL:?NEXTAUTH_URL is not set}"
: "${CLOUD_SQL_PROXY_VERSION:?CLOUD_SQL_PROXY_VERSION is missing from deploy/versions.env}"
REGION="${REGION:-us-west1}"
SQL_INSTANCE="${SQL_INSTANCE:-rac-db}"

# The values go into a sed expression: refuse anything that could not be
# part of an id, an image address or an https address.
for value in "$PROJECT_ID" "$IMAGE" "$POSTGREST_IMAGE" "$NEXTAUTH_URL" \
  "$REGION" "$SQL_INSTANCE" "$CLOUD_SQL_PROXY_VERSION"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9._:/@-]+$ ]]; then
    echo "render-service: unexpected characters in a value: $value" >&2
    exit 1
  fi
done

rendered="$(sed \
  -e "s|\${PROJECT}|$PROJECT_ID|g" \
  -e "s|\${IMAGE}|$IMAGE|g" \
  -e "s|\${POSTGREST_IMAGE}|$POSTGREST_IMAGE|g" \
  -e "s|\${NEXTAUTH_URL}|$NEXTAUTH_URL|g" \
  -e "s|\${CLOUD_SQL_PROXY_VERSION}|$CLOUD_SQL_PROXY_VERSION|g" \
  -e "s|\${SQL_CONNECTION}|$PROJECT_ID:$REGION:$SQL_INSTANCE|g" \
  "$HERE/service.template.yaml")"

# A name left unfilled must never reach Cloud Run. (Comment lines may
# mention "${…}"; only real lines are checked.)
if printf '%s\n' "$rendered" | grep -v '^[[:space:]]*#' | grep -q '\${'; then
  echo "render-service: a \${…} name in the template was not filled in:" >&2
  printf '%s\n' "$rendered" | grep -v '^[[:space:]]*#' | grep '\${' >&2
  exit 1
fi
printf '%s\n' "$rendered"
