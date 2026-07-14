# Patient Sign-In Redesign — ryuacupuncture.com

## Project Overview

Redesigning the hidden patient check-in page at /admin/patient-signin.
Patients check in physically using a 4-digit PIN. The page is kiosk-style —
admin unlocks it once at the start of the day, then patients use it
throughout the day unassisted.

## Tech Stack

- Framework: Next.js (App Router)
- Database: Supabase (PostgreSQL) via @supabase/supabase-js (service-role client, server-side only)
- EHR: Practice Better API (REST, OAuth2)
- PIN hashing: bcryptjs
- All secrets in .env.local — never hardcoded

## Environment Variables (.env.local)

- NEXT_PUBLIC_SUPABASE_URL=
- NEXT_PUBLIC_SUPABASE_ANON_KEY=
- SUPABASE_SERVICE_ROLE_KEY=
- PB_CLIENT_ID=
- PB_CLIENT_SECRET=
- PB_WEBHOOK_VERIFICATION_TOKEN= (self-generated; validates the one-time webhook handshake)
- PB_WEBHOOK_SIGNING_SECRET= (issued by PB at subscription creation; HMAC key for event POSTs)
- NEXTAUTH_SECRET= (openssl rand -base64 32; signs NextAuth JWTs)
- NEXTAUTH_URL= (http://localhost:3000 in dev; https://www.ryuacupuncture.com in prod)
- GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= (Google Cloud OAuth client)
- ALLOWED_ADMIN_EMAILS= (comma-separated staff Google accounts allowed to unlock the kiosk)

## Route Structure

- /admin/patient-signin — the kiosk page (protected by middleware)
- /api/auth/[...nextauth] — NextAuth (Google sign-in, session, callbacks)
- /api/patients/lookup — matches PIN, returns patient record
- /api/patients/setup-pin — creates PIN for new patient
- /api/appointments/today — fetches today's appointment from Practice Better
- /api/checkins — writes check-in record to Supabase
- /api/webhooks/practice-better — PB webhook: GET = verification handshake, POST = signed client.record.created events → upsert patient into Supabase

## Auth (Google sign-in via NextAuth)

- Staff unlock the kiosk by signing in with Google at /admin/login. There is
  no password — nothing to brute-force; Google supplies MFA and account
  security. NextAuth v4, JWT sessions, 24h maxAge (config: src/lib/auth.ts).
- Only Google accounts listed in ALLOWED_ADMIN_EMAILS may sign in
  (src/lib/admin-allowlist.ts). The allowlist is enforced in the signIn
  callback AND re-checked on every request (middleware + API guard), so
  removing an email revokes access immediately.
- src/middleware.ts protects /admin/\* via getToken() from next-auth/jwt.
- The patient API routes (lookup, setup-pin, appointments/today, checkins)
  require the session via isAdminAuthorized() (src/lib/admin-auth.ts) —
  401 without it. The webhook route is public but HMAC-signature verified.
- Failed PIN lookups are rate limited durably in Supabase
  (src/lib/pin-rate-limit.ts + pin_attempt_failures table): 20 failures per
  10 minutes, fails closed on DB errors. Defense against enumerating the
  10,000-PIN space; survives serverless cold starts.

## Supabase Schema

Canonical DDL: supabase/migrations/0001_patient_signin.sql (idempotent —
paste into the Supabase SQL editor to apply). RLS is enabled with no
policies on both tables; all access goes through the service-role key.

### patients table

| column       | type      | notes                     |
| ------------ | --------- | ------------------------- |
| id           | uuid      | primary key               |
| first_name   | string    |                           |
| last_name    | string    |                           |
| email        | string    | NOT unique — legacy PB import has families sharing emails; stored lowercase |
| phone        | string    |                           |
| pin          | string    | bcrypt hashed, nullable   |
| pb_client_id | string    | Practice Better client ID |
| phone_digits | string    | generated: phone stripped to digits; indexed for kiosk lookup |
| created_at   | timestamp | auto                      |

### checkins table

| column           | type      | notes                     |
| ---------------- | --------- | ------------------------- |
| id               | uuid      | primary key               |
| patient_id       | uuid      | foreign key → patients.id |
| checked_in_at    | timestamp | auto-set on insert        |
| appointment_time | string    | from Practice Better      |
| practitioner     | string    | from Practice Better      |

## Practice Better API

- Base URL: https://api.practicebetter.io (see src/lib/practice-better.ts)
- Auth: POST /oauth2/token (client_credentials) → bearer token
- Token is short-lived — fetch a fresh one per API call server-side
- Get today's sessions for a client:
  GET /consultant/sessions?records={pb_client_id}&date_eq={today}
- Get a single client record: GET /consultant/records/{id}
- All Practice Better calls happen in Next.js API routes (server-side only)

## Scripts

### scripts/sync-patients.js

- Authenticates with Practice Better API
- Fetches all client records (GET /consultant/records, paginated)
- Upserts into Supabase patients table using pb_client_id as the unique key
- Run manually from terminal: node scripts/sync-patients.js
- Safe to re-run — upsert won't duplicate records

### scripts/setup-pb-webhook.js

- One-time: registers the PB webhook subscription for client.record.created
- Requires PB_WEBHOOK_VERIFICATION_TOKEN set locally AND deployed first
- Prints the signing secret once — store as PB_WEBHOOK_SIGNING_SECRET
- Run: node scripts/setup-pb-webhook.js [endpointUrl]
  (default endpoint: https://www.ryuacupuncture.com/api/webhooks/practice-better)

## Page UI — /admin/patient-signin

### Admin Login Screen (/admin/login)

- Single password field + submit button
- Clean, minimal — staff-facing only

### Kiosk Screen (main UI) — two modes:

**Returning Patient**

- Numeric PIN pad (0–9) on screen — no physical keyboard needed
- Patient taps their 4-digit PIN
- On match: show name + appointment time + confirm button
- On confirm: log check-in, show "Thank you [first name]!" briefly, reset
- On no match: show "PIN not recognized, please see the front desk"

**New Patient**

- "First visit? Set up your PIN" button below the PIN pad
- Step 1: Enter phone number or email
  - Both emails and phones can match MULTIPLE patients (family members
    share contact info, esp. in the legacy PB import). Resolution: zero
    matches → "see the front desk"; all matches have PINs → "you already
    have a PIN"; exactly one match without a PIN → proceed with that
    patient; several without PINs → "Select your name to set up your PIN"
    screen listing each PIN-less match as first name + last INITIAL (never
    full last name); tapping a name proceeds to PIN creation for that
    patient. Patients who already have a PIN are never listed.
- Step 2: Enter a 4-digit PIN (twice to confirm)
- On success: hash with bcrypt, save to patients table, proceed to
  appointment confirmation as a normal check-in

## Security Notes

- PINs hashed with bcryptjs (never stored plain text)
- All DB and API calls in server-side API routes only
- Supabase service role key used server-side only; RLS enabled with no
  policies, so the anon key can read nothing
- Staff auth = Google sign-in (NextAuth) restricted to ALLOWED_ADMIN_EMAILS;
  no shared password exists
- Patient API routes require the staff session (401 otherwise)
- setup-pin PATCH refuses to overwrite an existing PIN (403) and enforces
  PIN uniqueness across patients
- Failed PIN lookups rate limited durably in Supabase (fails closed)
- No patient data logged to console
- /admin/\* routes protected by middleware.ts
