# syntax=docker/dockerfile:1
# The image both Cloud Run jobs run: psql and pg_dump of the pinned
# Postgres version, with the repository's SQL and the two scripts.
#
#   rac-migrate    /app/deploy/ops/migrate.sh
#   rac-copy-data  /app/deploy/ops/copy-data.sh copy | empty
#
# pg_dump must be at least as new as the database it reads (the Supabase
# project being left), which is why the version comes from
# deploy/versions.env and nowhere else.
#
# Build, from the repository root (cloudbuild.yaml does this):
#   . deploy/versions.env
#   docker build --platform linux/amd64 -f deploy/ops.Dockerfile \
#     --build-arg POSTGRES_MAJOR="$POSTGRES_MAJOR" -t rac-ops .
ARG POSTGRES_MAJOR
FROM postgres:${POSTGRES_MAJOR}

# Laid out as in the repository: the scripts find the SQL relative to
# themselves.
COPY supabase /app/supabase
COPY deploy/ops /app/deploy/ops

# No database runs in this container: drop the base image's start-up
# script, and run as its unprivileged user.
USER postgres
WORKDIR /app
ENTRYPOINT []
CMD ["/app/deploy/ops/migrate.sh"]
