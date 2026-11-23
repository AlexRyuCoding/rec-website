# syntax=docker/dockerfile:1
# The site as a container image, for Cloud Run (deploy/service.template.yaml).
# Vercel does not use this file.
#
# Node 22 or newer, not older: the Supabase client the server creates
# needs Node's built-in WebSocket and throws without it.
#
# Build (cloudbuild.yaml does this on every merge to main):
#   docker build --platform linux/amd64 \
#     --build-arg NEXT_PUBLIC_REALTIME_URL=… \
#     --build-arg NEXT_PUBLIC_REALTIME_ANON_KEY=… -t rac-web .

# ---- every package, exactly as the lock file says
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- next build
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Where live updates connect. Both are PUBLIC values (they are sent to
# every browser) and are fixed into the pages at build time, so the build
# needs them — and stops without them: a board built with neither cannot
# open at all.
ARG NEXT_PUBLIC_REALTIME_URL
ARG NEXT_PUBLIC_REALTIME_ANON_KEY
RUN test -n "$NEXT_PUBLIC_REALTIME_URL" && test -n "$NEXT_PUBLIC_REALTIME_ANON_KEY" \
  || { echo "Dockerfile: the build arguments NEXT_PUBLIC_REALTIME_URL and NEXT_PUBLIC_REALTIME_ANON_KEY are both required" >&2; exit 1; }
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_PUBLIC_REALTIME_ANON_KEY=$NEXT_PUBLIC_REALTIME_ANON_KEY
# next/font fetches the two typefaces from Google Fonts while building, and
# now and then that fetch comes back unusable ("An error occurred in
# `next/font`"). Nothing is wrong with the code when it does, so the build
# is tried up to three times before the image is given up on. A real
# error fails all three and still stops the build.
RUN for attempt in 1 2 3; do \
      npm run build && exit 0; \
      echo "Dockerfile: build attempt $attempt failed" >&2; \
      sleep 10; \
    done; exit 1

# ---- what runs: Next.js's standalone server and only the files it needs
FROM node:22-bookworm-slim AS run
WORKDIR /app
# HOSTNAME: the server listens on the address named there; Docker would
# otherwise set it to the container's own name.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# Owned by the unprivileged user: the server writes resized images under
# .next/cache.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
# PIN compares run in the `bcrypt` package's prebuilt binary
# (src/lib/pin-hash.ts). Prove here that the build copied the one for
# this platform and that it runs as this user: if not, the image is not
# made and nothing is deployed — instead of a site that quietly falls
# back to the slow JavaScript library.
RUN node -e 'const b = require("bcrypt"); if (!b.compareSync("x", b.hashSync("x", 4))) process.exit(1)'
EXPOSE 8080
CMD ["node", "server.js"]
