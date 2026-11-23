# syntax=docker/dockerfile:1
# The image the Cloud Run jobs run: psql and pg_dump of the pinned
# Postgres version, with the repository's SQL and the ops scripts — and,
# for the stamping job alone, Node with one library.
#
#   rac-migrate     /app/deploy/ops/migrate.sh
#   rac-copy-data   /app/deploy/ops/copy-data.sh copy | empty
#   rac-stamp-pins  /app/deploy/ops/stamp-pins.sh count | stamp
#
# pg_dump must be at least as new as the database it reads (the Supabase
# project being left), which is why the versions come from
# deploy/versions.env and nowhere else.
#
# Build, from the repository root (cloudbuild.yaml does this):
#   . deploy/versions.env
#   docker build --platform linux/amd64 -f deploy/ops.Dockerfile \
#     --build-arg POSTGRES_MAJOR="${POSTGRES_MAJOR}" \
#     --build-arg OPS_NODE_VERSION="${OPS_NODE_VERSION}" -t rac-ops .
ARG POSTGRES_MAJOR
ARG OPS_NODE_VERSION
# The base, said whole. Only scripts/test-ops.sh sets it (POSTGRES_IMAGE=…).
ARG POSTGRES_IMAGE=postgres:${POSTGRES_MAJOR}

# ---- what stamp-pins.sh needs: Node, and bcryptjs exactly as its lock
# file says (the version and checksum the app's own lock file has —
# src/lib/stamp-pins.test.ts compares the two).
FROM node:${OPS_NODE_VERSION}-bookworm-slim AS stamp
WORKDIR /stamp
COPY deploy/ops/stamp-pins/package.json deploy/ops/stamp-pins/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY deploy/ops/stamp-pins/ ./
# The job must stamp the fingerprint the app looks up, byte for byte. So
# the image is not made unless the job's copy of the rule gives the same
# values as the app's own source of this very commit, on all 10,000 PINs.
# (Copied as .mts: Node reads it as a module, leaving the types out.)
COPY src/lib/pin-lookup.ts /check/pin-lookup.mts
RUN node --disable-warning=ExperimentalWarning check-parity.mjs /check/pin-lookup.mts

FROM ${POSTGRES_IMAGE}

# Node is one file. The official build needs only libraries the Postgres
# image already has; the next line proves it, and that bcryptjs loads.
COPY --from=stamp /usr/local/bin/node /usr/local/bin/node

# Laid out as in the repository: the scripts find the SQL relative to
# themselves.
COPY supabase /app/supabase
COPY deploy/ops /app/deploy/ops
COPY --from=stamp /stamp/node_modules /app/deploy/ops/stamp-pins/node_modules

# No database runs in this container: drop the base image's start-up
# script, and run as its unprivileged user.
USER postgres
WORKDIR /app
RUN cd /app/deploy/ops/stamp-pins \
  && node -e 'import("bcryptjs").then((b) => { if (!b.default.compareSync("x", b.default.hashSync("x", 4))) process.exit(1); })'
ENTRYPOINT []
CMD ["/app/deploy/ops/migrate.sh"]
