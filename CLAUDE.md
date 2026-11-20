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
- Frontend: single dark theme (no light/dark toggle); GSAP + ScrollTrigger +
  Lenis for public-page motion; Instrument Serif + Inter Tight via next/font
- Public forms (/api/request-form, /api/grievance-form): zod-validated,
  honeypot field `company`, per-IP rate limit (5/hour) in Supabase
  (form_submission_events table, migration 0006 — must be applied)

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
- CRON_SECRET= (self-generated; auths the daily Vercel Cron keepalive ping)
- RESEND_API_KEY= (Resend API key; sends appointment-request + grievance form emails)
- RESEND_FROM_EMAIL= (sender on the Resend-verified domain, e.g. forms@ryuacupuncture.com; falls back to onboarding@resend.dev which only delivers to the Resend account owner)

## Route Structure

- /admin/patient-signin — the kiosk page (protected by middleware)
- /admin/dashboard — staff dashboard: check-ins viewer (Today/Yesterday/
  week/month/custom + Refresh + CSV export; shows appointment time and
  service per check-in) and patient search with Reset PIN
- /api/auth/[...nextauth] — NextAuth (Google sign-in, session, callbacks)
- /api/admin/checkins — GET check-ins in a from/to range, joined with names
- /api/admin/patients — GET staff patient search (returns has_pin, never the hash)
- /admin/rooms — staff rooms board: per-room timers, doctor pills, the
  waiting list of checked-in patients, and room assignment (see "Patient
  room flow" below)
- /waiting-room — the waiting-room TV ("Alex R. → Room 3"). NOT under
  /admin: the page shell is public and holds no patient data; its data
  API needs a paired-screen cookie or a staff session
- /api/admin/rooms — GET rooms + doctor roster + open visits + server
  time; POST creates a room. /api/admin/rooms/[id] PATCH/DELETE (PATCH
  accepts capacity 1–4 = beds). /api/admin/rooms/[id]/timer POST timer
  actions (start/pause/resume/adjust/set/reset/clear/ready)
- /api/admin/visits/[id] — POST {action: assign(roomId) | unassign |
  remove | mark_waiting} moves a checked-in patient through the flow
  (mark_waiting undoes a mistaken "Doctor in")
- /api/admin/rooms/[id]/doctor-in — POST: the doctor has walked in; marks
  the room's waiting patients seen (no timer change)
- /api/admin/displays — GET paired screens; /approve POST {code, label?}
  pairs the TV showing that code; /[id] DELETE revokes a screen
- /api/display/pair — PUBLIC POST: a TV asks for a pairing code (useless
  until staff approve it; rate limited 10/hour/IP, fails closed)
- /api/display/calls — GET who is being called to which room; paired
  screen cookie or staff session only
- /api/admin/reset-pin — POST clears a patient's PIN (patient re-creates at kiosk)
- /api/admin/sync-patients — POST bulk-syncs PB client records in chunks
  (~500/call, before_id cursor); the dashboard "Full sync" button loops it
  until done. {quick:true} = newest 100 only (catches recently created
  patients, e.g. a missed webhook; PB orders by creation, so it can't see
  edits to old records) and reports how many were genuinely new
- /api/cron/keepalive — daily Vercel Cron ping (Bearer CRON_SECRET) so the
  free-tier Supabase project never pauses for inactivity
- /api/patients/lookup — matches PIN, returns patient record
- /api/patients/setup-pin — creates PIN for new patient
- /api/appointments/today — fetches today's appointment from Practice Better
- /api/checkins — writes check-in record to Supabase (patient_id + timestamp,
  plus a snapshot of today's PB appointment time, service name and
  practitioner; nullable, fails open if PB is unreachable). The new row is
  also the patient's visit: it appears in the rooms board's waiting list
- /api/webhooks/practice-better — PB webhook: GET = verification handshake, POST = signed client.record.created/updated events → upsert patient into Supabase (PB is the source of truth for contact info; staff fix wrong numbers/emails in PB, never in Supabase)

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

| column         | type      | notes                                         |
| -------------- | --------- | --------------------------------------------- |
| id             | uuid      | primary key                                   |
| patient_id     | uuid      | foreign key → patients.id                     |
| checked_in_at  | timestamp | auto-set on insert                            |
| appointment_at | timestamp | nullable; today's PB session time, snapshotted at check-in (migration 0007) |
| service_name   | text      | nullable; PB service name, snapshotted at check-in (migration 0007) |
| practitioner_name | text   | nullable; PB doctor, snapshotted at check-in (migration 0011) |
| room_id        | uuid      | nullable; → rooms.id, on delete set null (0011) |
| room_assigned_at | timestamp | nullable; staff assigned a room (0011)      |
| called_at      | timestamp | nullable; patient told to go to the room (0011) |
| seen_at        | timestamp | nullable; the room's timer was started (0011) |
| done_at        | timestamp | nullable; visit finished or removed (0011)    |

A check-in logs who + when + a snapshot of the appointment (time, service
name and practitioner, fetched live from PB at check-in; null if PB is
unreachable or there is no session that day).

### rooms / doctors / display_devices

rooms (0008–0011): grid position, doctor_name (from the doctors roster),
default duration, timer_* timestamps, capacity (beds, default 1; Room 5 =
2), turnover_started_at. doctors (0009–0010): roster of ≤5 names with a
color each. display_devices (0011): paired waiting-room screens — pairing
code, sha256 of the device secret, label, approved/revoked/last-seen.

## Patient room flow (migration 0011 — must be applied)

Spec: docs/superpowers/specs/2026-11-19-patient-room-flow-design.md.
Rules live in src/lib/patient-flow.ts (pure, tested); routes apply them
through src/lib/flow-server.ts.

- One checkins row = one visit. Its state is derived from timestamps,
  never stored: no room → waiting; room but not called → next up; called
  → patient told to go; seen → the doctor is in (tapped "Doctor in", or at
  the latest started the timer); done → finished. Open visits older than
  12 h drop off by themselves.
- STAFF choose the room (never the system): tap a waiting chip, then a
  room. A free bed → called now; busy room → lined up ("next up") and
  called automatically when the room is ready.
- Room status with no timer running: turnover_started_at set → Turning
  over; else any occupant not yet seen → Patient waiting; else any
  occupant → With doctor; else Available. The timer is started once the
  needles are in, so "With doctor" covers the gap before that.
- Doctor alert: while a room has an unseen patient, every rooms board
  shows a large banner in that doctor's color (pinned to the top, with a
  "Doctor in" button) and rings three times when it appears. It cannot be
  dismissed — only "Doctor in" or Start clears it. Tapping a patient's
  name on a With-doctor tile offers "Doctor hasn't come yet" to undo.
- ✓ (clear) = "needles out": silences the alarm and starts Turning over;
  the patient is still in the room, so nobody is called. "Room ready"
  finishes the room's patients and calls whoever is lined up. Reset only
  cancels the timer (the patient stays, still "seen" → With doctor). A Start sent during turnover
  (only an old, un-reloaded board can do that) counts as Room ready +
  Start.
- Promotion is a rule, not a button: after every change, an idle room
  (no timer, not turning over) with a free bed calls its lined-up
  patients, oldest first.
- When a patient is called, the room's doctor pill switches to the roster
  doctor matching the appointment's PB practitioner (all words of the
  roster name must appear in the PB name; exactly one match or no change).
- Patient names leave the server only as "First L." (display_name).
- NEVER put patient data in a Realtime broadcast: the channel is readable
  with the public anon key. Room broadcasts carry anonymous room rows;
  the "flow-updated" event has an empty payload and just means "refetch".
- Waiting-room TV pairing: TV opens /waiting-room → shows a 6-char code →
  staff enter it in Dashboard → Screens → the TV's httpOnly rac_display
  cookie (id + secret; only the hash is stored) now authorises that one
  screen until revoked. No env var involved.

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
- On confirm: log check-in, show "Thank you [first name]!" and "Please
  have a seat — your name and room will appear on the screen", reset
- Re-check-in within 4 hours: no duplicate row; shows "You're already
  checked in" instead
- On no match: show "PIN not recognized, please see the front desk"
- Kiosk resets to the PIN pad after 60s of inactivity (abandoned flows
  must not leave patient info on screen)

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
- Waiting-room screens authenticate with a staff-approved device cookie;
  they can read only "First L." + room name of patients being called
