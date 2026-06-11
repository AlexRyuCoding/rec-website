# Practice Better → Supabase Patient Pipeline + Unique PINs

**Date:** 2026-06-11
**Status:** Approved

## Goal

Keep the Supabase `patients` table in sync with Practice Better so the kiosk
PIN check-in always knows every patient, and guarantee each 4-digit PIN maps
to exactly one patient.

## Context

The kiosk flow (keypad UI, PIN lookup, new-patient PIN setup, check-in
logging, today's-appointment fetch) already exists on the `patient-signin`
branch. Bulk import is handled by `scripts/sync-patients.js` (run manually,
idempotent upsert keyed on `pb_client_id`).

## Components

### 1. Webhook receiver — `src/app/api/webhooks/practice-better/route.ts` (new)

- **GET** — one-time endpoint verification handshake. Validates the
  `verification_token` query param against `PB_WEBHOOK_VERIFICATION_TOKEN`,
  responds `200 { challenge, timestamp }` (Unix seconds). Wrong/missing
  token → 401.
- **POST** — signed event deliveries. Reads the **raw** request body, then
  validates the `PB-Signature` header (`t=<unix>,v1=<hex>`):
  - expected = HMAC-SHA256(`PB_WEBHOOK_SIGNING_SECRET`, `{t}.{rawBody}`)
  - constant-time comparison; reject if |now − t| > 300s (replay window)
  - invalid → 401, malformed payload → 400
- On `client.record.created`: extract the record ID from the payload, fetch
  `GET /consultant/records/{id}` from Practice Better (fresh OAuth token per
  call), and upsert into Supabase:
  `{ pb_client_id, first_name, last_name, email, phone }` where `phone` is
  `profile.mobilePhone` falling back to `profile.homePhone`.
  Fetching the record rather than trusting the event payload shape keeps the
  handler robust (the API doc does not define the event body schema).
- Any other event type → 200, ignored.
- Downstream failure (PB fetch or Supabase write) → 500 so Practice Better
  retries delivery.
- No patient data logged.

### 2. Registration script — `scripts/setup-pb-webhook.js` (new)

One-time script run from the terminal after the endpoint is deployed:

- Registers a subscription via `POST /webhooks/subscription` with
  `endpointUrl: https://www.ryuacupuncture.com/api/webhooks/practice-better`,
  `eventTypes: ["client.record.created"]`, and the verification token from
  `.env.local`.
- Prints the `plaintextSigningSecret` (returned only once) with instructions
  to store it as `PB_WEBHOOK_SIGNING_SECRET` in `.env.local` and in the
  hosting provider's env vars.

### 3. PIN uniqueness — `src/app/api/patients/setup-pin/route.ts` (change)

In the PATCH handler, before saving: bcrypt-compare the candidate PIN against
every existing patient PIN hash. On any match → `409` with
"That PIN is already taken — please choose a different one." The keypad UI
surfaces the message and lets the patient pick a new PIN. O(n) bcrypt
compares are acceptable at clinic scale.

### 4. Housekeeping

- Ensure `middleware.ts` does not intercept `/api/webhooks/*`.
- Document `PB_WEBHOOK_VERIFICATION_TOKEN` and `PB_WEBHOOK_SIGNING_SECRET`
  in CLAUDE.md.
- Commit the pending `sync-patients.js` / `appointments/today` endpoint fixes
  as their own commit.

## Environment Variables (new)

| var | purpose |
| --- | --- |
| `PB_WEBHOOK_VERIFICATION_TOKEN` | self-generated; validates the one-time GET handshake |
| `PB_WEBHOOK_SIGNING_SECRET` | issued by PB at subscription creation; HMAC key for event POSTs |

## Testing

No test framework in the repo; verification is manual:

- Local signing script (curl + computed HMAC) exercises the webhook route
  with valid signature, bad signature, stale timestamp, and non-client event.
- Kiosk flow exercised locally: duplicate PIN rejected with the 409 message,
  unique PIN accepted.
