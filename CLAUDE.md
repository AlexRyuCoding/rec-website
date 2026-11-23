# Patient Sign-In Redesign — ryuacupuncture.com

## Project Overview

Redesigning the hidden patient check-in page at /admin/patient-signin.
Patients check in physically using a 4-digit PIN. The page is kiosk-style —
the tablet is paired once as a kiosk device (see "Kiosk pairing"), then
patients use it unassisted; it needs no staff sign-in.

## Tech Stack

- Framework: Next.js (App Router)
- Database: PostgreSQL through PostgREST, via @supabase/supabase-js
  (service-role client, server-side only). The site runs on Google
  Cloud since 2026-11-22 — Cloud Run + Cloud SQL (Postgres 17), with a
  PostgREST container beside the app — see "Hosting". The same build
  still runs on Vercel + Supabase (Supabase's own PostgREST) until the
  clean-up removes that side
- Live updates: Supabase Realtime (broadcast only, never patient data),
  in a Supabase project of its own once the Realtime settings are set
- EHR: Practice Better API (REST, OAuth2)
- PIN hashing: bcryptjs
- All secrets in .env.local — never hardcoded
- Frontend: single dark theme (no light/dark toggle) — except the staff
  dashboard and the rooms board, which have a light / dark / match-this-
  device switch, and the staff login page, which shows that choice (see
  "Staff look"); GSAP + ScrollTrigger + Lenis for public-page motion;
  Instrument Serif + Inter Tight via next/font
- Public forms (/api/request-form, /api/grievance-form): zod-validated,
  honeypot field `company`, per-IP rate limit (5/hour) in Supabase
  (form_submission_events table, migration 0006 — must be applied)

## Environment Variables (.env.local)

- NEXT_PUBLIC_SUPABASE_URL= / NEXT_PUBLIC_SUPABASE_ANON_KEY= /
  SUPABASE_SERVICE_ROLE_KEY= (the Vercel + Supabase side only: database
  and — unless the Realtime three below are set — live updates. Not set on
  Google Cloud; they go away after the switch)
- DB_REST_URL= / DB_REST_JWT= (Google Cloud side: PostgREST's address,
  http://127.0.0.1:3001, and the token it accepts. Set together: the URL
  without the token is an error, never a quiet return to Supabase)
- NEXT_PUBLIC_REALTIME_URL= / NEXT_PUBLIC_REALTIME_ANON_KEY= /
  REALTIME_SERVICE_KEY= (live updates' own Supabase project: its address,
  its publishable key, its secret key. All three or none — half a set is
  ignored and Supabase's are used whole. The two NEXT_PUBLIC ones are
  fixed into the pages at build time)
- CLIENT_IP_FROM_RIGHT= (Google Cloud side: 2. Which entry of
  x-forwarded-for, counted from the right, is the caller's address —
  see getClientIp. Not set on Vercel)
- PB_CLIENT_ID=
- PB_CLIENT_SECRET=
- PB_WEBHOOK_VERIFICATION_TOKEN= (self-generated; validates the one-time webhook handshake)
- PB_WEBHOOK_SIGNING_SECRET= (issued by PB at subscription creation; HMAC key for event POSTs)
- NEXTAUTH_SECRET= (openssl rand -base64 32; signs NextAuth JWTs)
- NEXTAUTH_URL= (http://localhost:3000 in dev; https://www.ryuacupuncture.com in prod)
- GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= (Google Cloud OAuth client)
- ALLOWED_ADMIN_EMAILS= (comma-separated staff Google accounts allowed to unlock the kiosk)
- CRON_SECRET= (self-generated; auths the daily keepalive ping — Vercel
  Cron on Vercel, Cloud Scheduler on Google Cloud)
- RESEND_API_KEY= (Resend API key; sends appointment-request + grievance form emails)
- RESEND_FROM_EMAIL= (sender on the Resend-verified domain, e.g. forms@ryuacupuncture.com; falls back to onboarding@resend.dev which only delivers to the Resend account owner)
- SPOTIFY_CLIENT_ID= / SPOTIFY_CLIENT_SECRET= (optional; a Spotify developer app, only needed for Spotify as the waiting-room music source. Its Redirect URI must be https://www.ryuacupuncture.com/api/admin/spotify/callback)
- SPOTIFY_REDIRECT_URI= (optional; local dev only — Spotify refuses "localhost", so use http://127.0.0.1:3000/api/admin/spotify/callback)

## Hosting (Google Cloud; Vercel + Supabase until the clean-up)

The owner's step-by-step: deploy/RUNBOOK.md. The switch to Google Cloud
was made on 2026-11-22. A merge to `main` is built and deployed to the
LIVE site by Cloud Build (trigger `rac-deploy-main`) in about six
minutes: merge on a day the clinic is closed, or after hours. Until the
clean-up, the build must still work on both hosts, chosen only by
environment variables: with none of the Google-side variables set,
behaviour is exactly Vercel + Supabase.

- No query was rewritten. `createServiceClient()` (src/lib/supabase.ts)
  asks `dbTarget(process.env)` (src/lib/db-rest.ts, pure, tested) where
  to point: Supabase, or — with DB_REST_URL — a PostgREST of our own,
  the same REST layer Supabase runs. supabase-js always asks for
  `/rest/v1/<table>`; a bare PostgREST serves `/<table>`, so the prefix
  is taken off each request. Do not change `.from()` / `.rpc()` call
  sites or fake-supabase.ts for the sake of the host.
- Live updates read their own settings (src/lib/realtime-config.ts,
  tested): the Realtime three as a complete set, otherwise Supabase's,
  never a mix. next.config.js applies the browser's half of that rule to
  the content-security policy (csp.test.ts) — keep the two in step, or
  the policy blocks the board's websocket, which crashes the page on an
  iPad.
- The caller's address (getClientIp, src/lib/validation.ts, tested):
  behind Google's load balancer it is counted from the RIGHT of
  x-forwarded-for (CLIENT_IP_FROM_RIGHT) and x-real-ip is never read —
  a caller can forge everything to the left of what the load balancer
  wrote. The per-address limits (forms, TV and kiosk pairing) depend on it.
- NEXTAUTH_SECRET is the SAME value on both hosts (carried across
  sealed on 2026-11-22; deploy/RUNBOOK.md, "What the rehearsal found").
  Do not issue a new one for the switch: the PIN fingerprints are keyed
  with it, and under a new key the rehearsal measured 7 to 8 seconds
  per PIN. A wrong PIN takes about 10 seconds on either host for now —
  fingerprints only exist since migration 0017, so most PIN holders are
  still compared the slow way; speeding that up is a follow-up.
- A route that sends a redirect builds the address with siteUrl()
  (src/lib/site-url.ts, tested — on NEXTAUTH_URL), never from `req.url`:
  on Cloud Run that is the server's own listening address
  (http://0.0.0.0:8080). Reading the query of `req.url` is fine, and the
  middleware's redirects leave as paths.
- Google's load balancer removes the request header
  `x-middleware-subrequest` (deploy/RUNBOOK.md 1.8.6, checked by 1.10.5):
  on next 15.1.11 that header skips src/middleware.ts (CVE-2025-29927) —
  the staff pages' empty shells would open; every staff API still
  answers 401 by itself. Vercel protects its own sites. The lasting fix
  is next 15.2.3 or later (a follow-up): until then never drop the
  `headerAction` from the URL map, and keep the service reachable only
  through the load balancer.
- On Google Cloud one Cloud Run instance is three containers sharing
  localhost (deploy/service.template.yaml, filled in by
  deploy/render-service.sh): the app (the only one receiving requests),
  PostgREST on 127.0.0.1:3001, and the Cloud SQL Auth Proxy on
  127.0.0.1:5432, started in the reverse of that order. PostgREST has NO
  anonymous role (never set PGRST_DB_ANON_ROLE): a request without the
  app's token is refused before it reaches the database.
- Versions are pinned in one place, deploy/versions.env: Postgres 17 (the
  major of the Supabase project being left — the ops image's pg_dump
  must be at least that), PostgREST (chosen by `npm run test:rest`, not
  copied from Supabase), the Cloud SQL Auth Proxy.
- The server needs Node 22 or newer (Dockerfile): the Supabase client
  throws on older ones for lack of a built-in WebSocket.
- Images: Dockerfile (the site, Next.js `output: "standalone"`, port
  8080, unprivileged user; the two NEXT_PUBLIC_REALTIME values are build
  arguments and the build stops without them) and deploy/ops.Dockerfile
  (psql + pg_dump + the SQL + the ops scripts, for the two jobs).
  cloudbuild.yaml builds and deploys on every push to `main`; it never
  runs a migration.
- Migrations on Google Cloud are applied on purpose, by executing the
  job `rac-migrate` (deploy/ops/migrate.sh): roles → password of
  PostgREST's login → migrations not yet recorded, each in one
  transaction with its record → grants → `notify pgrst` so PostgREST
  re-reads the schema (it keeps its own picture; without this a new
  table is "not found" until a restart). A migration is merged and
  applied BEFORE the code that needs it. Supabase does none of this:
  there, a migration is still pasted into the SQL editor.
- Real patient data moves only by the job `rac-copy-data`
  (deploy/ops/copy-data.sh), started by the owner: one transaction on
  the destination, prints a count per table and never a row (database
  errors are shown as their code alone — the full text can quote a row).
- Secrets live in Google Secret Manager and are put there with
  deploy/ops/set-secret.sh, which never prints one or puts one on a
  command line. Never ask the owner to paste a secret into a chat.
- Tests beyond `npm test` and `npm run test:db`:
  - `npm run test:ops` — migrate.sh, copy-data.sh, set-secret.sh (with a
    stand-in gcloud) and render-service.sh, against a throwaway local
    Postgres, run as an administrator that is not a superuser (as on
    Cloud SQL).
  - `npm run test:rest` — needs Docker. Postgres + PostgREST at the
    pinned versions (deploy/local/docker-compose.yml), built by
    migrate.sh; src/lib/db-rest.integration.test.ts runs the app's own
    queries through createServiceClient(). A case that fails there is a
    real difference from Supabase: change the pinned version or
    PostgREST's settings, never the app's query code.
  - `POSTGRES_IMAGE=postgres:17 npm run test:db` (or `test:ops`) — the
    same suites inside that image, i.e. on the version Cloud SQL runs.

## Route Structure

- /admin/patient-signin — the kiosk page. The page shell is public and
  holds no patient data (like /waiting-room): it has to open on a tablet
  with no credentials, to show a pairing code. Its API routes answer only
  a paired kiosk or a staff session
- /admin/dashboard — staff dashboard, four tabs: Check-ins (today or
  any range: where each visit stands and how long patients waited — see
  "Dashboard check-ins"), Patients (search with Check in + Reset PIN, and
  "Log" = that patient's audit trail), Setup (paired screens and kiosks,
  waiting-room music, Practice Better sync) and Log (the staff audit
  log). The header shows who is signed in and has Sign out. ?tab=patients
  opens the search directly (the rooms board's "Check in a patient"
  link); ?tab=setup, or the way back from Spotify, opens Setup; ?tab=log
- /api/admin/audit — GET the staff audit log, newest first, 100 a page
  (&before=<id>), optionally &action=, &staff=<email>, &patient=<uuid>
  (never a name — it would sit in request logs). no-store
- /api/auth/[...nextauth] — NextAuth (Google sign-in, session, callbacks)
- /api/admin/checkins — GET check-ins in a from/to range, newest first,
  500 a page (&offset= for more), each with names, practitioner, room and
  the visit's timestamps; the first page also carries the wait-time
  numbers for the WHOLE range (`stats`). no-store.
  POST {patient_id} = staff check a patient in themselves (see "Staff
  check-in" below)
- /api/admin/patients — POST {q} staff patient search (returns has_pin,
  never the hash); see "Patient search" below
- /admin/rooms — staff rooms board: per-room timers, doctor pills, the
  waiting list of checked-in patients, and room assignment (see "Patient
  room flow" below)
- /waiting-room — the waiting-room TV ("Alex R. → Room 3"). NOT under
  /admin: the page shell is public and holds no patient data; its data
  API needs a paired-screen cookie or a staff session. Shown on a 42-inch
  TV across the waiting room: sizes are in vh only, and anything patients
  must read is at least text-[5.5vh] (~2 cm letters; the music bar in the
  header is ambience and is deliberately smaller). It always shows a
  clock with seconds and a door reminder ("When you enter your room,
  please close the door, but leave it slightly open." with a large
  door-open icon); the call list sizes itself to the space above that.
  Nothing on it pops in or blinks out (see "Waiting-room TV motion")
- /api/admin/rooms — GET rooms + doctor roster + open visits + server
  time; POST creates a room. /api/admin/rooms/[id] PATCH/DELETE (PATCH
  accepts capacity 1–4 = beds; DELETE is refused with 409 while the room
  has patients, a line, a running timer or is setting up —
  roomDeleteBlocker). /api/admin/rooms/[id]/timer POST timer
  actions (start/pause/resume/adjust/set/reset/clear/ready/again)
- /api/admin/visits/finished — GET today's finished visits ("First L."),
  newest first, for the board's Finished list
- /api/admin/expected — GET who is still expected today (Practice Better
  appointments whose patients have not checked in, "First L."), for the
  board's Expected list; ?refresh=1 asks Practice Better again
- /api/admin/visits/[id] — POST {action: assign(roomId, togetherWith?) |
  unassign | remove | mark_waiting | restore} moves a checked-in patient through
  the flow (togetherWith = the visit ids staff said the patient is
  together with; mark_waiting undoes a mistaken "Doctor in"; restore
  reopens a FINISHED visit)
- /api/admin/rooms/[id]/doctor-in — POST: the doctor has walked in; marks
  the room's waiting patients seen (no timer change)
- /api/admin/displays — GET paired screens AND kiosks (each with `kind`:
  'tv' | 'kiosk'); /approve POST {code, label?, kind?} pairs the device
  showing that code — looked up only among devices of that kind (default
  'tv'); /[id] DELETE revokes a screen or a kiosk
- /api/kiosk/pair — PUBLIC POST: the kiosk tablet asks for a pairing code
  (same rules as the TV's); DELETE = "Cancel" on the code screen, refused
  for an approved kiosk. /api/kiosk/status — PUBLIC GET: paired | staff |
  pending (+code) | none | error; what the kiosk page should show
- /api/display/pair — PUBLIC POST: a TV asks for a pairing code (useless
  until staff approve it; rate limited 10/hour/IP, fails closed)
- /api/display/calls — GET who is being called to which room; paired
  screen cookie or staff session only. The reply also carries the
  background-music setting (`music`), so the TV needs only this one poll
- /api/admin/music — GET/PATCH the waiting-room music setting (staff);
  PATCH changes only the fields sent. GET also returns staff's saved
  radio stations
- /api/admin/music/stations — POST {name, url} keeps a radio station for
  later; /api/admin/music/stations/[id] DELETE removes it (staff)
- /api/admin/spotify/login → Spotify consent → /api/admin/spotify/callback
  connects the clinic's Spotify account (staff); DELETE /api/admin/spotify
  disconnects it
- /api/display/spotify-token — GET a one-hour Spotify access token for
  the TV's player; /api/display/now-playing — GET the track the chosen
  radio station is playing. Both: paired screen cookie or staff session
- /api/admin/reset-pin — POST clears a patient's PIN (patient re-creates at
  kiosk); written to the staff audit log
- /api/admin/sync-patients — POST bulk-syncs PB client records in chunks
  (~500/call, before_id cursor); the dashboard "Full sync" button loops it
  until done. {quick:true} = newest 100 only (catches recently created
  patients, e.g. a missed webhook; PB orders by creation, so it can't see
  edits to old records) and reports how many were genuinely new
- /api/cron/keepalive — daily ping (Bearer CRON_SECRET; Vercel Cron or
  Cloud Scheduler) so a free-tier Supabase project never pauses for
  inactivity. With live updates in a project of their own it reads one
  row of THAT project's `keepalive` table and does not touch the
  database; otherwise it counts patients in the one Supabase project
- /api/patients/lookup — matches PIN, returns patient record
- /api/patients/setup-pin — creates PIN for new patient
  (both through src/lib/pin-server.ts — see "PIN lookup" below)
- /api/appointments/today — fetches today's appointment from Practice Better
- /api/checkins — writes check-in record to Supabase (patient_id + timestamp,
  plus a snapshot of today's PB appointment time, service name and
  practitioner; nullable, fails open if PB is unreachable). The new row is
  also the patient's visit: it appears in the rooms board's waiting list.
  The kiosk's route; the writing itself is src/lib/checkin-server.ts
- /api/webhooks/practice-better — PB webhook: GET = verification handshake, POST = signed client.record.created/updated events → upsert patient into Supabase (PB is the source of truth for contact info; staff fix wrong numbers/emails in PB, never in Supabase)

## Auth (Google sign-in via NextAuth)

- Staff sign in with Google at /admin/login. There is
  no password — nothing to brute-force; Google supplies MFA and account
  security. NextAuth v4, JWT sessions (config: src/lib/auth.ts).
- A sign-in ends at the clinic's next 3 am (src/lib/staff-session.ts,
  pure, tested), not 24 h after the button was pressed: NextAuth never
  refreshes the cookie here, so a plain 24 h session signed in at 8:10
  dropped the kiosk and the boards to the login screen at 8:10 the next
  day, mid-clinic. The end is stamped into the token at sign-in (`dayEnd`)
  and checked wherever the allowlist is. Staff still sign in once at the
  start of each day. (24 h maxAge remains as the cookie's outer limit.)
- Every staff API route (/api/admin/*) is written as
  `export const POST = staffRoute(async (req, staff, { params }) => …)`
  (src/lib/staff-route.ts). The wrapper is the sign-in check — Google
  session, allowlist, day's end, not a kiosk (getAdminEmail) — and
  answers 401 no-store otherwise; the handler gets `staff.email` for the
  audit log. staff-route.test.ts fails if a file under /api/admin exports
  a handler that is not wrapped, or checks the session by itself. Two
  routes a browser navigates to (the Spotify connect flow) redirect to
  the login page instead (`whenNotStaff`); one handler is open on
  purpose and listed in that test (the stale-tab notice, GET
  /api/admin/patients).
- Migrations 0001–0020 are all applied (2026-11-22). The code no longer
  carries "this migration may not be applied yet" fallbacks: a missing
  column or function is a database error, shown as one. Do not add such
  fallbacks back for a new migration unless a deploy genuinely has to
  run before it — they hid real errors (a check-in silently saved
  without its practitioner; a board that showed no patients instead of
  an error). What remains on purpose is resilience to a database hiccup,
  not to a missing migration: the audit log fails open, the music keeps
  playing if its setting cannot be read, the "First visit" badge is left
  off if history cannot be read.
- The login page returns staff to the page they came from (?next=, only
  /admin/* paths are accepted; default = the kiosk). Pages that get a 401
  use goToStaffLogin() (src/lib/staff-login-redirect.ts).
- Only Google accounts listed in ALLOWED_ADMIN_EMAILS may sign in
  (src/lib/admin-allowlist.ts). The allowlist is enforced in the signIn
  callback AND re-checked on every request (middleware + API guard), so
  removing an email revokes access immediately.
- src/middleware.ts protects /admin/\* via getToken() from next-auth/jwt;
  the decision itself is adminPageGate (src/lib/admin-gate.ts, pure,
  tested). /admin/login and the kiosk page shell are open.
- The patient API routes (lookup, setup-pin, appointments/today, checkins)
  require a paired kiosk OR a staff session. Each is written as
  `export const POST = kioskRoute(async (req) => …)`
  (src/lib/kiosk-route.ts — the kiosk's counterpart of staffRoute, over
  isKioskAuthorized in kiosk-auth-server.ts): 401 no-store otherwise.
  kiosk-route.test.ts lists the kiosk's routes and fails if one is not
  wrapped; a new kiosk route goes in that list. The webhook route is
  public but HMAC-signature verified.
- Failed PIN lookups are rate limited durably in Supabase
  (src/lib/pin-rate-limit.ts + pin_attempt_failures table): 20 failures per
  10 minutes, fails closed on DB errors. Defense against enumerating the
  10,000-PIN space; survives serverless cold starts.

## Supabase Schema

Where the DDL runs. On Supabase: paste a migration into the SQL editor.
On Google Cloud (Cloud SQL): the job `rac-migrate` (deploy/ops/migrate.sh)
applies supabase/cloud-sql/roles.sql, then every migration not yet
recorded in ops.schema_migrations, then supabase/cloud-sql/grants.sql —
see "Hosting". There, row-level security is on for every table with ONE
policy per table, `app_all`, for `service_role` only (Cloud SQL cannot
hand out BYPASSRLS, which is how Supabase's service role gets through):
any other role still reads and writes nothing. Wherever a section below
says "RLS with no policies", read "no policy for anyone but the app's
role" on Google Cloud; supabase/tests/app_roles.sql holds it.

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
| pin_lookup   | string    | nullable, unique; keyed fingerprint of the PIN for one-query lookup (migration 0017) |
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

Records from Practice Better: the webhook and the dashboard sync both
turn a PB client record into a patients row with toPatientRow
(src/lib/patient-record.ts, tested). Names lose the
spaces around them, runs of blanks (tabs, non-breaking spaces) become one
space and invisible pasted characters are dropped, so "Ann " and "Ann"
are one spelling; the email is trimmed and lowercased; a blank email or
phone is stored as null; a blank mobile falls back to the home phone.
Rows already stored are cleaned the next time they are synced (Full sync).

A check-in logs who + when + a snapshot of the appointment (time, service
name and practitioner, fetched live from PB at check-in; null if PB is
unreachable or there is no session that day).

### rooms / doctors / display_devices

waiting_room_music (0012): a single row — source, the link for each
source, volume, paused, and the encrypted Spotify refresh token.
radio_stations (0013): staff's saved radio stations — name + unique
stream address.

rooms (0008–0011): grid position, doctor_name (from the doctors roster),
default duration, timer_* timestamps, capacity (beds, default 1; Room 5 =
2), turnover_started_at. doctors (0009–0010): roster of ≤5 names with a
color each. display_devices (0011): paired waiting-room screens — pairing
code, sha256 of the device secret, label, approved/revoked/last-seen.
kiosk_devices (0018): paired check-in kiosks, same columns, own table.

## Patient search (migration 0014 — should be applied)

Dashboard → Patients. The typed text is split into words in
src/lib/patient-search.ts (pure, tested); 4+ digits = a phone search
(tried with and without a leading 1). The `search_patients` database
function (0014) decides who matches and in what order;
src/lib/patient-search-server.ts calls it.

- EVERY word must match the patient: inside the first name, last name or
  email, in any order ("Ann Lic", "Licater, Ann"). Accents are ignored
  (unaccent) and a word of 4+ letters also matches a close spelling of a
  name (pg_trgm word_similarity ≥ 0.5: "Licatr", "Micheal").
- Order: whole name > start of a name > inside a name > close spelling >
  email only. 20 are shown; the reply's `more` flag makes the dashboard
  say "type more of the name".
- The function is SECURITY INVOKER on purpose: RLS (no policies) is what
  keeps it empty for the anon key. Never make it security definer.
- The database function is the only search: if it cannot answer, the
  dashboard says "Database error". (There was a plain word-by-word
  fallback while 0014 was being rolled out; it is gone.)
- Database tests: supabase/tests/*.sql, run with `npm run test:db` (a
  throwaway local Postgres with every migration applied; needs Postgres
  installed, touches nothing on Supabase).
- The text travels in a POST body, never in the address: a name in
  `?q=` ends up in request logs. The reply is `Cache-Control: no-store`.
  (GET answers 405 "This page is out of date. Please reload it." for
  tabs left open from before.)
- The dashboard searches as staff type: one request 250 ms after typing
  pauses, at once on Enter / Search. src/lib/latest-search.ts (pure,
  tested) guarantees only the reply to the LATEST text is shown — a slow
  older reply must never overwrite a newer one. Because the list changes
  under the staff member's hands: the no-match message sits below
  everything else, the "Searching…" hint is inside the box (shown only
  after 300 ms), the Search button never changes width, and the reset
  confirmation names the patient ("Reset PIN for Ann Licater").
- "Reset PIN" is replaced, where it stood, by the button that does the
  resetting; that button ignores presses for 350 ms after it appears
  (createTapGuard, the kiosk's rule). Do not remove it: without it the
  second half of a double-click on "Reset PIN" clears the PIN.
- The kiosk's phone/email lookup stays EXACT — do not point it at this
  function: a fuzzy match there would show a patient someone else's name.

## PIN lookup (migration 0017 — should be applied)

bcrypt hashes cannot be searched, so signing in used to mean comparing
the PIN against every patient's hash in turn (~15 ms each): seconds once
a few hundred patients have PINs. patients.pin_lookup now holds a
fingerprint of the PIN — an HMAC under a key derived from NEXTAUTH_SECRET
(src/lib/pin-lookup.ts, pure, tested) — in a unique index. Server side:
src/lib/pin-server.ts (findPatientByPin, pinUsedByAnother, saveNewPin;
tested).

- Lookup = one indexed query for the fingerprint, then ONE bcrypt compare
  to confirm. The bcrypt hash stays the authority; a fingerprint alone
  never signs anyone in.
- Nothing is backfilled (a fingerprint needs the PIN, which is not
  stored). A patient without a current fingerprint is found the old way
  once and stamped. So wrong PINs still cost a compare against every
  not-yet-stamped patient; that shrinks as patients return.
- The fingerprint starts with an id of its key. Rotating NEXTAUTH_SECRET
  makes every fingerprint "old": patients are found the old way once and
  re-stamped. Nobody is locked out and nothing needs clearing by hand.
- A database trigger clears pin_lookup whenever pin changes without a new
  fingerprint in the same statement (staff Reset PIN), so reset-pin did
  not need to learn about the column. Do not remove the trigger: a stale
  fingerprint would block another patient from choosing that PIN.
- The unique index also closes the race where two patients choose the
  same PIN at the same moment (saveNewPin answers "taken").
- Without NEXTAUTH_SECRET there are no fingerprints and every PIN holder
  is compared, as before fingerprints existed. A database error during a
  lookup is an error (the kiosk says "Something went wrong. Please try again…"), not a silent switch
  to the slow way; a new PIN's hash and fingerprint are written together
  or not at all.
- Why an HMAC and not a plain hash: with only 10,000 possible PINs any
  unkeyed hash is reversed by trying them all; the key lives only on the
  server.

## Expected arrivals (migration 0020 — must be applied to use it)

Rooms board → waiting list → "Expected": today's Practice Better
appointments whose patients have not checked in, earliest first, with
"in 25 min" / "12 min late" (amber from 10 minutes late, red from 30) and
a "Check in" button — the ordinary staff check-in, so it is audited.
Rules: src/lib/expected.ts (pure, tested); cache and joins:
src/lib/expected-server.ts; panel: rooms/ExpectedPanel.tsx.

- The day's schedule is fetched ONCE and shared (day_schedule_cache, one
  row per clinic day): a board asking within 5 minutes reads the row.
  "Refresh" asks Practice Better again, at most every 30 seconds. This is
  what keeps the list to a few hundred of PB's 10,000 daily requests
  however many tablets are open. Without the table the route answers
  "not available" and asks Practice Better NOTHING — never "fix" that by
  fetching per request.
- The cached schedule holds no names: {pbClientId, at, practitioner,
  service}. Patients are found in our own table by pb_client_id; who has
  checked in is read fresh on every request, so a patient leaves the list
  the moment they check in.
- An appointment whose patient is not in our table yet cannot be listed
  or checked in; the panel says how many there are and points to
  Dashboard → Setup → Quick sync.
- If Practice Better cannot be reached and today's copy is held, the old
  copy is shown, marked "may be out of date". Yesterday's row is never
  used for today (and is deleted when today's is written).
- Practice Better's reply is read defensively (parsePbSessions): a
  session with a missing or odd field is dropped, not fatal. Cancelled
  sessions and sessions with no single client record (group classes) are
  left out.
- One row per patient (their first appointment of the day). A patient who
  checked in at any time today is not expected, even for a second
  appointment.
- Not logged in the audit log as a view — like the waiting list, it is
  the board's ordinary work; the check-in itself is logged.

## When a staff page breaks

src/app/admin/error.tsx. The rooms board and the kiosk run unattended, so
a page that fails to render says "One moment, please" and reloads itself
after 8 s — worded for whoever is standing there, which on the kiosk is a
patient. After three reloads in a row (within 2 minutes) it stops and
asks for the front desk; a page that breaks every time must not flicker
forever. After a reload the board's sounds are blocked until touched —
the silent-board bar says so.

## Dashboard check-ins

Dashboard → Check-ins (src/app/admin/dashboard/CheckinsPanel.tsx). Rules
are pure and tested: src/lib/visit-stats.ts (status, times, summary, CSV)
and src/lib/checkin-range.ts (date ranges); the reads are
src/lib/checkins-server.ts. No new table or column: everything is read
off the timestamps a visit collects on the rooms board.

- Status per check-in (checkinStatus): Waiting · n min / Next up / Called
  / With doctor (with the room) while it is on the board; Finished = the
  doctor saw them and the room was marked ready; Removed = ended without
  being seen (a no-show, a mistake); Not closed = never finished and
  older than the board's 12 h window.
- Once the doctor has been in, the patient follows the ROOM's timer and
  is shown under the words on the room's tile (owner's decision: "match
  the board"): In Use (timer running, or paused) / Remove Needles (time
  up) / Overtime / Setting Up (needles out, not yet "Room ready"). "With
  doctor" is only the gap before the timer is started. The words come
  from ROOM_STATUS_LABEL (room-status.ts), which the tile uses too — do
  not write them a second time. A visit carries no timer: the list reads
  the room's timer columns with each check-in (`room_timer`). Only a
  patient the doctor has SEEN follows it — someone lined up for that
  room, or called and still waiting, is not on that timer.
- The pill turns when the timer does, not on the next refresh: the list
  re-reads the clock at the moment the next timer ends or goes into
  overtime (nextStatusChangeMs). It uses the computer's own clock, so it
  can be a few seconds off the board.
- Times: wait for a room = check-in → called; wait for the doctor =
  called → seen; whole visit = check-in → done (only visits that were
  seen). The summary shows the MEDIAN ("typical") with the count and the
  longest — not the average: one forgotten "Room ready" would otherwise
  turn a 45-minute visit into a 15-hour one and drag the number with it.
- The numbers describe the whole range, not the page on screen: the API
  reads the range's timestamps (no names) separately, up to 20,000
  check-ins, and says so if the range was larger. If that read fails the
  list is still shown, without numbers.
- Ranges are calendar days of the computer the dashboard is open on,
  stepped as days, never as 24 hours (clock-change days are 23 or 25
  hours long). "Custom" opens on the last 30 days and cannot go past
  today; dates typed the wrong way round are swapped.
- A range that reaches today keeps itself current: at once on the rooms
  board's "flow-updated" hint — and its "rooms-updated" one, because a
  pause or "needles out" moves no patient but changes a status (used as
  a hint only; what that message carries is not read) — and once a
  minute. A refresh never blanks
  the list ("Loading…" is only for a new range), does not run while
  another dashboard tab is showing, and does not run once "Load more" has
  been used (it would throw the older pages away under the reader).
- Export CSV exports EVERY check-in of the range (it pages through the
  API), with status, room, each timestamp and the three times. Cells
  that a spreadsheet would run as a formula (=, +, -, @ first) get an
  apostrophe in front; the file starts with a BOM so Excel reads accents.
- Check-ins and Patients stay mounted when the other tab shows (a
  half-typed search survives a tab switch); Setup's panels load the first
  time Setup is opened. Sync moved to Setup: it used to sit between the
  search box and its results.
- Errors on the dashboard use one red (text-ui-error / bg-ui-error-fill).

## Staff look (dashboard and rooms board)

Design: docs/superpowers/specs/2026-11-21-dashboard-refresh-design.md
(the rooms board gets the same look next:
2026-11-22-rooms-board-refresh-design.md). Colours, ledges and
animations: src/app/admin/staff-theme.css; pieces: src/app/admin/ui/
(Button, Segmented, Panel, Tag, Banner, StatusPill, AutoHeight,
ThemeSwitch, Backdrop, styles.ts); the theme rule: src/lib/staff-theme.ts
(pure, tested).

- Rectangles are pressed, pills are read. What can be pressed is raised
  on a hard ledge (buttons, the thumb of a switch, the open tab), what is
  typed or chosen in is sunken (fields, a switch's track), what holds
  work is a raised panel, and what is only read is flat (status pills,
  tags, rows). A status is always a pill and never a button.
- No blurred shadow, anywhere (owner's decision: "sharp edges, not the
  soft fall-off"). Depth is a solid ledge — a box-shadow with zero blur —
  and faces are solid colours, no gradients.
- Every colour is a `ui-*` Tailwind name backed by a `--ui-*` variable,
  defined once per theme. Text is at least 4.5:1 on the surface it sits
  on. staff-theme.test.ts fails on: a variable missing from one theme, a
  pair below 4.5:1, a shadow with a blur, and — in the dashboard or the
  shared pieces — any class that is a Tailwind palette colour
  (text-white, bg-black, text-red-500…), one of the site's old names
  (brand-, cream…), a literal colour (text-[#…]), a named colour thinned
  with an opacity (bg-ui-panel/50) or a shadow that is not one of the
  five ledges. The detector is src/app/admin/look-guard.ts (tested on
  its own: a guard that lets things through is worse than none). The
  exceptions are listed in the test with their reasons — today two:
  YouTube's red and Spotify's green on the music source switch.
- Each of the eleven check-in statuses has its own colour AND shape
  (pillLook, tested): still on the board = filled pill with a dot; on
  the room's timer = filled pill with a clock, a bell once the time is
  up; finished / removed = grey with a mark; not closed = outline with a
  warning. Never tell statuses apart by colour alone.
- Theme: one choice per browser (localStorage `rac-staff-theme`:
  system | light | dark; default system). While a themed page is mounted
  `<html>` carries `data-staff-theme` — everything hangs off it — and it
  is taken off when the page is left (use-staff-theme.ts), so the kiosk,
  the TV and the public site cannot be themed. The dashboard's layout
  inlines a script that sets it before first paint (no flash); the
  script and the hook must agree (staff-theme.test.ts runs them against
  each other). Storage being blocked must never break the switch.
- The staff login page (login/page.tsx + LoginCard.tsx) has the look
  but no switch of its own: it shows the choice made on this browser.
  With nothing chosen it does what the page being signed in to does
  (loginThemeFallback, tested): on the way to the dashboard it follows
  the computer; on the way to the rooms board, the kiosk or nowhere in
  particular it is dark — so signing in never flips the look, and a wall
  tablet's login screen does not turn light by day. Its pre-paint script
  is in the page, not a layout: only a page is given `?next=`.
- A photograph sits behind the page, one per theme (public/staff-bg-*.jpg,
  about 300 KB each, a fixed layer — not background-attachment: fixed,
  which iPad Safari ignores). Nothing is read straight off it: every
  text and control sits on an opaque surface — which is why toolbars are
  panels and messages are banners. The tab's accent line takes its
  colour from the photo (forest green / copper); buttons stay teal.
- A pressed button moves down 2px onto its ledge — and, while pressed,
  reaches 2px back up (the `before:` part of the classes), so a pointer
  resting on its top edge is still on it when the press is let go.
  Without that the click is lost.
- Pressing the theme item that is already shown stores nothing: on the
  board "nothing chosen" means dark, and a stored "system" would undo
  that (the dashboard shows "system" for both).
- Motion is short (80–280 ms) and follows the change, never delays it.
  A switch's thumb and the tab tile slide (use-thumb.ts — only after a
  press on that control; every other time they are put in place); a
  tab's content rises in; a new date range fades its numbers up (a
  refresh of the same range animates nothing); the theme cross-fades.
  Patient search results only fade — nothing there may slide or resize.
  Summary numbers never count up. prefers-reduced-motion: fades stay,
  sliding and resizing go.
- The rooms board is in two parts with opposite rules
  (docs/superpowers/specs/2026-11-22-rooms-board-refresh-design.md;
  rooms/rooms-look.test.ts holds both):
  - Its FRAME — top bar, waiting list, Expected / Finished / Sounds,
    the layout editor — follows the theme like the dashboard.
  - A room TILE never does. Its solid status colour is the signal read
    from across the room, so the tile and everything on it (white text,
    the keys, the doctor pill, the dark overlays) look the same in both
    themes, and nothing in RoomTile.tsx, WaitingBanner.tsx or rooms/tile/
    may use a ui-* colour. Tiles and their keys get the hard ledge from
    rooms/tile/key-styles.ts, in a darker shade of their own colour.
  - Signals in the frame are literal too and listed in the test: a
    waiting name is an amber key from 10 minutes and a red one from 20
    (waitLevel); the "sounds are silent" bar is amber.
  - With no theme chosen on the device the board is DARK, not "match
    this tablet" (rooms/layout.tsx, useStaffTheme("dark")): the wall
    iPads are on automatic appearance and the board would change its
    look at sunset by itself. A choice made on either page wins on both.
  - On tiles, their keys and the waiting names, ledges and edges are
    shadows and rings, never borders or margins: the restyle changed no
    size there (10 tiles, 77 in-tile buttons and the waiting names were
    measured against the old board — identical). Keep it that way: a 1px
    border on a waiting name pushed every room 2px down the tablet. The
    frame's own buttons did gain a 1px edge: the "tap to turn on sounds"
    bar and the error bar are 2px taller, the top bar 2px shorter — with
    sounds on, the rooms sit 2px higher than they did.
  - A literal fill carries literal text. A theme colour on a signal's
    fill is right in one theme only ("First visit" on an amber name was
    2.2:1 in light). The doctor alert has a dark edge of its own (the
    ring's offset) because its pale fill disappears against the light
    photo; doctorColorClasses' fallback is a solid grey pill, not white
    on a see-through band, for the same reason.
  - Nothing that GSAP or the drag library moves gets a CSS transform or
    a transition on transform: waiting names (arrivals, dragging) and
    the doctor list's options lose their ledge when pressed but do not
    move. GSAP leaves an inline transform behind that beats any class.
  - The photo goes UNDER the board's content (`<Backdrop under />` in an
    `isolate` root) instead of the content being lifted over it, so the
    board's own layers — Sounds popover, the sticky doctor alert, the
    editor's dialog, the silent bar — stack as they always did. Giving
    the header or the content a z-index for the photo's sake put the
    Sounds panel behind the board.
  - No new motion on the board: tile colours cross-fade (as before),
    keys press down 2px, the theme cross-fades. Nothing slides.
- Two Tailwind utilities for the same property do not override each
  other by their order in a class list. That is why styles.ts has
  fieldBaseClass (no padding) beside fieldClass, and why a tab panel
  must not get a display class (`flex` would beat its `hidden`
  attribute and show every tab at once).

## Staff check-in

Dashboard → Patients → "Check in" on a search result (the rooms board
links there with "Check in a patient"). For a walk-in, a forgotten PIN,
the kiosk being down, or a patient taken off the board by mistake. The
patient lands in the board's waiting list like any check-in.

- Rules in src/lib/checkin-server.ts (repeatRule + createCheckin,
  tested), shared with the kiosk. What counts as "already checked in"
  differs on purpose: at the kiosk, ANY check-in in the last 4 hours
  (finished or not — a PIN re-typed on the way out must not put the
  patient back on the board); for staff, only a visit that is still OPEN.
  So a staff check-in is the way back for a patient removed by mistake.
- The search stays on the dashboard, not on the rooms board: it shows
  full names and contact details, and the board is "First L." only.

## Staff audit log (migrations 0015, 0016, 0019 — should be applied)

staff_audit_log: who did what with patient information, when, and to
which patients — id, at, staff_email, action, patient_ids uuid[], detail.
Actions, their names on the page and the wording of a range are in
src/lib/audit-log.ts (pure, tested); writing and reading is
src/lib/audit-server.ts. The staff email comes from getAdminEmail().

| action | written when | detail |
| --- | --- | --- |
| patient_search | a dashboard search listed patients | the text typed |
| pin_reset | a PIN was cleared | — |
| staff_checkin (0016) | staff checked a patient in | — |
| checkins_view (0019) | the check-in history was shown | the dates covered |
| checkins_export (0019) | it was exported as CSV | the dates covered |
| visit_remove (0019) | a patient was taken off the rooms board | from where |
| visit_restore (0019) | a finished patient was put back | to where |
| device_pair (0019) | a screen or kiosk was paired | kind and name |
| device_revoke (0019) | one was revoked | kind and name |

- Read on Dashboard → Log (AuditPanel.tsx): newest first, filter by kind
  of activity or staff member, "Show older entries". "Log" on a patient
  search result opens it narrowed to that patient — the question the log
  exists for is "who looked at this patient?" (GIN index on patient_ids,
  0019). A row shows its first three patients by name and counts the
  rest. Read-only: no route edits or deletes a row. Reading the log is
  not itself logged.
- It fails OPEN, by decision: if the row cannot be written (a database
  hiccup) the action still happens and the app logs
  "audit log write failed" with the error code only. The front desk must
  not be locked out of finding a patient by the logbook.
- Searching while typing writes a row per request, so one lookup is
  often 2–4 rows ("an", "ann", "ann lic"). Each one did list patients.
- A check-in history VIEW is written at most once per 15 minutes for the
  same person and dates (recordStaffActionOnce): the list refreshes
  itself every minute, and a row a minute would bury everything else.
  The server decides this, not the page — a view cannot be hidden by
  what the browser sends. Each row lists the patients on that page.
- An EXPORT is written every time, one row per 500 check-ins exported.
  "Export CSV" always asks the server again (&export=1) even when the
  list on screen is complete: the file is what leaves the building.
- Not logged, on purpose: sending patients to rooms, "Doctor in", timers
  (the board's ordinary work, dozens of times a day) and anything the
  kiosk does (a patient acting for themselves).
- Nothing prunes the table.
- RLS on, no policies; patient_ids is deliberately not a foreign key
  (the record outlives the patient — the page then shows "1 patient").

## Patient room flow (migrations 0011 and 0021 — must be applied)

Spec: docs/superpowers/specs/2026-11-19-patient-room-flow-design.md.
Rules live in src/lib/patient-flow.ts (pure, tested); routes apply them
through src/lib/flow-server.ts.

- One checkins row = one visit. Its state is derived from timestamps,
  never stored: no room → waiting; room but not called → next up; called
  → patient told to go; seen → the doctor is in (tapped "Doctor in", or at
  the latest started the timer); done → finished. Open visits older than
  12 h drop off by themselves.
- STAFF choose the room (never the system): tap a waiting chip, then a
  room. A room holds ONE GROUP at a time — people share a multi-bed room
  only when staff say they came together; a patient alone in one gets it
  to themselves. An empty room → called now. A room with someone in it
  and a spare bed → the board asks "Together with Alex R.?" (yes = called
  now, no = lined up as "next up"). A room that already has a line → the
  only offer is to join that line (the line is one group too). All beds
  taken, or Setting Up → lined up. Lined-up patients are called
  automatically when the room is ready.
- Privacy fails closed (do not regress): the "yes" travels as
  `togetherWith` — the visit ids the question named — and the server
  refuses it ("Room 5 changed — please choose again") unless those are
  still exactly the room's occupants / line. Absent = not together, so a
  board that never asked (old page, stale picture) lines the patient up.
  The question on the tile closes by itself when its names change; it
  never re-words in place, and the tile then reads "Room 5 changed —
  choose again" and takes no presses for 2.5 s (a tap already heading
  for "Yes" must land on nothing). The answers ignore presses for 350 ms
  after the question opens. An assign for a patient who already has a
  room is refused — rooms are given from the waiting list only, so that
  request can only come from a stale board, and moving the patient would
  free the room they are physically in.
- Two boards assigning at the same instant (do not regress): the rules
  only see what a request read, so an assign is written through
  commitAssign (src/lib/flow-server.ts, tested with the in-memory
  database in src/lib/testing/fake-supabase.ts). The write lands only if
  the patient still has no room; the visits are then read AGAIN, and if
  the patient is beside anyone the request did not name (assignCollision)
  the write is undone before any board is told to refetch, and the board
  gets "Room 5 changed — please choose again". Whichever request reads
  second always sees the other, so strangers are never both left in a
  room; if both see each other, both are undone. If the second read
  fails, the assign is undone too. The same step calls a patient who was
  lined up for a room that emptied in the meantime.
- A board action is written whole or not at all (migration 0021,
  apply_flow_change; applyFlowChange in src/lib/visits-server.ts). "Room
  ready" on a couple with someone lined up is three visits and a room:
  they change in ONE database transaction, so a dropped connection can
  no longer leave one of a couple finished and the other not, or a room
  "ready" with its patients still in it. The app still decides what
  changes (patient-flow.ts, room-status.ts); the function only writes
  it, and only the five flow columns of a visit and the timer columns of
  a room. It is SECURITY INVOKER like search_patients — never definer.
- Timer route: Start, Another session, Room ready and Reset can move
  patients, so who is in the room is read first and the room + its
  patients go as one change (commitRoomFlow); if they cannot be read the
  action is refused, not applied to the timer alone. Pause, resume, +/-,
  typing a time and ✓ touch only the timer and read nothing about
  patients — ✓ is what silences the alarm and must not depend on
  anything else (timer-route.test.ts holds both halves).
- The one sanctioned migration fallback: if apply_flow_change does not
  exist (the minutes between a deploy and running 0021), the rows are
  written one by one as before, with a warning in the server log. Any
  other failure is a failure. Remove this fallback once 0021 is applied
  everywhere.
- A flow write the database refuses is an error on the board that asked
  (commitFlow throws), never a silent "nothing happened"; the other
  boards are told to refetch first.
- With a mouse the chip can also be dragged onto a room (@dnd-kit, in
  page.tsx / WaitingList.tsx / RoomTile.tsx). It is the same action as
  tap-then-tap: picking a chip up selects it, letting go over a room is
  the tap. MouseSensor only, on purpose — a finger on the iPads must keep
  tapping and scrolling the list. The dragged copy covers the tile's
  label, so it says what the drop will do itself ("Send to Room 1").
- Room status with no timer running: turnover_started_at set → Setting
  Up (the status is still called `turnover` in code); else any occupant
  not yet seen → Patient waiting; else any
  occupant → With doctor; else Available. The timer is started once the
  needles are in, so "With doctor" covers the gap before that.
- Doctor alert: while a room has an unseen patient, every rooms board
  shows a large banner in that doctor's color (pinned to the top, with a
  "Doctor in" button) and rings the doorbell sound when it appears. It cannot be
  dismissed — only "Doctor in" or Start clears it (it stays up in Edit
  layout too). Tapping a patient's
  name on a With-doctor tile offers "Doctor hasn't come yet" to undo.
- Escalation (src/lib/alert-escalation.ts, pure, tested; useAlarm.ts asks
  it once a second). The doorbell used to ring once and then only show.
  Two rungs now:
  1. At the call it rings on tablets set to that room's doctor, on
     tablets set to everyone, and on every tablet if the room has no
     doctor on its pill.
  2. After 7 minutes with no "Doctor in" (LONG_WAIT_MS) it rings on EVERY
     tablet, whoever each is set to, and again every 3 minutes
     (REPEAT_MS) until someone goes. The banner gets a red outline and
     "Long wait 7:13"; the tile is outlined and its status line reads
     "Long wait 7:13".
  Rung 1 is the per-tablet setting in the board's Sounds panel ("Doorbell
  on this tablet rings for": Everyone, or one or more doctors), kept in
  that tablet's localStorage and shown on the Sounds button. Rung 2 is
  what makes it safe (do not weaken it): a tablet is only ever quiet for
  the first seven minutes, so a quiet tablet is never why a patient is
  forgotten. The setting changes SOUND only — every banner shows on
  every board, as before — and not the timer sounds. A tablet set only
  to doctors no longer on the roster rings for everyone. Patients
  already waiting when a page loads do not ring at once (history, not
  news); a long wait rings 3 minutes after the load.
- Waiting-list chips are coloured by how long the patient has been KEPT
  waiting (waitLevel): amber from 10 minutes, red from 20, counted from
  the appointment time — or from check-in if they arrived after it or
  have no appointment. Someone who checks in half an hour early has not
  been kept waiting for half an hour. Colour only; it rings nothing.
- ✓ (clear) = "needles out": silences the alarm and starts Setting Up;
  the patient is still in the room, so nobody is called. From there the
  tile offers two buttons. "Room ready" finishes the room's patients and
  calls whoever is lined up. "Another session" (timer action `again`)
  starts the timer again for the same patients, at the time shown on the
  tile: nobody is finished, nobody is called. It is how a patient gets
  several timed sessions in a row — fire cupping is two 8-minute
  sessions; the doctor sets up the next one in the room, walks out and
  taps it. A mistaken "Another session" is undone with ✓. Reset only
  cancels the timer (the patient stays, still "seen" → With doctor). Reset
  takes two taps (the first arms it for 4 s — it sits beside ✓ and throws
  the running time away); so do "Remove" in a tile's patient menu and the
  bin in Edit layout. A
  Start sent during Setting Up (only an old, un-reloaded board can do
  that) counts as Room ready + Start — which is why "Another session" is
  its own action.
- Promotion is a rule, not a button: after every change, an idle room
  (no timer, not setting up) with NO occupants calls its whole line,
  oldest first. Empty, not "a free bed": if one of a couple leaves early,
  the line must not be pulled in beside the partner who is still there.
- When a patient is called, the room's doctor pill switches to the roster
  doctor matching the appointment's PB practitioner (all words of the
  roster name must appear in the PB name; exactly one match or no change).
- Alert sounds are defined as data in src/lib/sounds.ts and must stay
  unmistakably different from one another in melody, tone colour, rhythm
  AND pitch range (sounds.test.ts enforces it — keep those tests when
  retuning). Staff board (useAlarm.ts): patient waiting = doorbell
  ding-dong ×3 (repeats while nobody goes — see Escalation above); timer done = kitchen-timer beeps (very high, pulsed),
  repeating every 20 s until ✓; overtime (5 min past zero) = low buzzing
  two-tone alarm, repeating the same way; a board with both plays both in
  turn. Waiting-room TV: a soft rising four-note chime per call, and once
  when sound is switched on. The board's "Sounds" button lets staff play
  each one.
- A browser plays no sound after a page load until the screen is touched
  once. A board with sounds turned on that is in that state (a tablet
  that reloaded by itself) shows an amber bar fixed to the bottom edge —
  "Alert sounds are silent on this screen until it is touched" — driven
  by the AudioContext's real state (alertSoundStatus in sounds.ts). Fixed
  position on purpose: the tap that clears it must not move the board.
- Typing a time on a tile: Enter sets it; leaving the box sets it only if
  the number was changed; an emptied box and Escape set nothing
  (typedMinutesToSeconds in room-status.ts). Leaving must never move a
  timer by itself — the box opens rounded to whole minutes.
- Finished → Restore (the waiting list's "Finished" button): the way
  back from the two taps that end a visit with no undo — "Room ready" on
  the wrong tile, a wrong "Remove". Lists visits that ended within the
  12 h window. Where a restore lands is restoreTarget (pure, tested;
  the button says it): back in the room they had been called into,
  exactly as they were (same call time, same "seen" — nobody is called
  again), but ONLY if that room now stands idle and empty with no line;
  otherwise the waiting list. Never into a room with anyone in it or
  lined up for it. commitRestore writes only while the visit is still
  finished, re-reads, and moves the patient to the waiting list if
  anyone else reached that room at the same instant (or it cannot tell).
- Today's service (service_name, already snapshotted at check-in) is
  shown on the staff board — waiting chips, a line under the names on a
  tile, in full in the patient's menu. It tells the doctor what the visit
  is before walking in (fire cupping = two sessions). Staff board only:
  never the waiting-room TV, never a broadcast.
- "First visit" badge = the patient's record is under 60 days old AND
  they have never checked in before (firstVisitIds, tested). Both, on
  purpose: the check-in log only goes back to when the kiosk started, so
  "never checked in" alone would greet patients of many years as new. A
  wrong badge is worse than none — anything unknown is not a first visit.
  History is only queried for patients with a new record (usually none).
- Tile sizes (do not shrink back): everything pressed without looking —
  − / +, Start, Pause, Reset, ✓, Doctor in — is at least 40×40 px; when
  time is up ✓ is the wide "Needles out" button; the status line is
  13 px. With a wait running the status line reads "Waiting 12:34" (the
  full "Patient waiting" would push the minutes off the tile). The tile
  height (grid.ts, 238 px) is the least that fits a room with patients, a
  service, a line and those buttons — and two rows of rooms plus one
  doctor alert still fit a 10-inch tablet (1080×810). RoomTile.tsx is
  the tile's face; what opens over it is in rooms/tile/ (TimeControl,
  DoctorPanel, PatientMenu, JoinQuestionOverlay).
- Patient names leave the server only as "First L." (display_name).
- NEVER put patient data in a Realtime broadcast: the channel is readable
  with the public anon key. Room broadcasts carry anonymous room rows;
  the "flow-updated" event has an empty payload and just means "refetch".
- Waiting-room TV pairing: TV opens /waiting-room → shows a 6-char code →
  staff enter it in Dashboard → Screens → the TV's httpOnly rac_display
  cookie (id + secret; only the hash is stored) now authorises that one
  screen until revoked. No env var involved.

## Waiting-room TV motion

Patients watch this screen for minutes, so every change is animated.
Styles: src/app/waiting-room/board.css; building blocks:
src/app/waiting-room/motion.tsx (Appear, Swap, useLingering); ordering
rules: src/lib/lingering.ts (pure, tested).

- A block that comes or goes (clock, music bar, door reminder, staff
  notes) is wrapped in Appear: it fades up into place and fades away,
  still showing what it last showed.
- The middle of the screen is one Swap: loading / error / pairing code /
  "Please have a seat" / the call list. The old view fades out BEFORE the
  new one fades in, so two large texts never overlap.
- A called patient's row opens (height 0 → full, pushing the others
  down), glows gold with rounded corners, and closes when the call ends;
  rows glide to a smaller size when there are more than three. A call is
  "news" (opens + glows) for 20 s after called_at, so calls already on
  screen at page load stay still.
- Do not regress these, each was measured frame by frame:
  - Arrivals are CSS @keyframes (they start on mount by themselves), not
    a class flipped a frame later with requestAnimationFrame — the tab is
    cast, and may not be the visible one on the computer.
  - A collapsing row needs three layers (li grid → .tv-row-clip →
    padded body). Padding or a border on the squeezed layer keeps it
    from reaching zero and the rows below jump at the end.
  - Exit durations are set once in motion.tsx and passed to the CSS as
    variables; do not hard-code them in board.css.
- prefers-reduced-motion: fades stay, sliding and resizing are dropped.

## Waiting-room music (migrations 0012 + 0013 — must be applied)

Staff choose ONE source in Dashboard → Waiting-room music; the TV plays
it and shows what is playing in a bar between the logo and the clock
(track/video/station, a progress bar when there is a length, LIVE when
there is not). Pure rules: src/lib/music.ts (tested). Server:
src/lib/music-server.ts, src/lib/spotify-server.ts. Players:
src/app/waiting-room/music/ (useRadio, useYouTube, useSpotify, MusicBar).

- Settings are one row in waiting_room_music. The TV learns them from
  /api/display/calls; a PATCH sends the empty "flow-updated" hint so it
  switches in about a second. If the setting cannot be read the field is
  left out and the TV keeps playing — music must never get in the way of
  calling patients.
- Radio: an <audio> element on any https stream (presets in music.ts,
  staff's own "My stations", or a pasted stream address). My stations
  (radio_stations table, migration 0013, max 30) are added from the
  "Other station…" form and removed from the list under it; adding or
  removing never changes what is playing — the setting stores the
  stream's address and name, not a link to the row. If the saved list
  cannot be read the panel still works with the presets and hides "Add
  to My stations". A dropped or stalled stream reconnects by
  itself. The track name is read server-side from the stream's ICY
  metadata (browsers hide it from the page); the server only ever reads
  the station saved by staff, never an address from the request.
- YouTube: the IFrame player, sound only — it is kept out of sight
  (200×200, transparent) by the owner's decision, knowing YouTube's terms
  ask for a visible player. A single video repeats, a playlist loops.
  Adverts play unless the TV's browser is signed in to YouTube Premium.
- Spotify: the Web Playback SDK makes the TV page a Spotify Connect
  device ("Waiting Room TV") on the clinic's Premium account. Staff
  connect the account once; the refresh token is stored encrypted
  (src/lib/secret-box.ts, key derived from NEXTAUTH_SECRET — rotating
  that secret means reconnecting Spotify) and never leaves the server.
  Spotify plays on one device at a time: if the account is used elsewhere
  the TV goes quiet and does NOT grab playback back; Save in the
  dashboard brings it back. Run as a personal, non-commercial Spotify
  developer app by the owner's decision.
- Music starts only after the TV page has been clicked once (the same
  click that enables the chime). This is deliberate: a staff member
  previewing /waiting-room elsewhere must not start a second copy.
- While a patient is called the music drops to 25 % for a few seconds.
- The content-security policy is loosened for /waiting-room ONLY
  (next.config.js: YouTube + Spotify scripts/frames, any https audio).
  Reach that page with a full page load, never next/link, or it inherits
  the stricter policy of the page it came from.

## Practice Better API

- Base URL: https://api.practicebetter.io (see src/lib/practice-better.ts)
- Auth: POST /oauth2/token (client_credentials) → bearer token
- Token is short-lived — fetch a fresh one per API call server-side
- Every call has a timeout (PB_TIMEOUT_MS, 5 s; 20 s for a page of the
  bulk sync): a request that never settles must not hold a kiosk
  check-in — it fails open like an outage does
- Get today's sessions for a client:
  GET /consultant/sessions?records={pb_client_id}&date_eq={today}
- Get a single client record: GET /consultant/records/{id}
- Get the whole day's sessions, all clients: GET /consultant/sessions with
  date_gte / date_lte and NO `records` (optional per the spec), 100 a
  page — fetchDaySessionItems. Only ever called through the shared cache
  (see "Expected arrivals")
- Limits (from PB's spec): 5 requests a second, bursts of 20, 10,000 a
  day for everything the clinic does with the API. A kiosk check-in costs
  about four
- All Practice Better calls happen in Next.js API routes (server-side only)

## Scripts

scripts/sync-patients.js is gone: it wrote to Supabase's REST address
from a laptop, which a database on Google Cloud does not offer. Dashboard
→ Setup → "Full sync" does the same job.

### scripts/setup-pb-webhook.js

- One-time: registers the PB webhook subscription for client.record.created
- Requires PB_WEBHOOK_VERIFICATION_TOKEN set locally AND deployed first
- Prints the signing secret once — store as PB_WEBHOOK_SIGNING_SECRET
- Run: node scripts/setup-pb-webhook.js [endpointUrl]
  (default endpoint: https://www.ryuacupuncture.com/api/webhooks/practice-better)
- It prints a secret: the owner runs it in a terminal of their own

### scripts/mint-db-jwt.js

- Makes DB_REST_JWT (role: service_role, HS256, no expiry) from
  PostgREST's signing secret: secret in on stdin, token out on stdout,
  nothing on a command line. Refuses a secret under 32 characters

### deploy/ops/ (run inside Google Cloud, or by `npm run test:ops`)

- migrate.sh — builds or updates a database outside Supabase (job
  `rac-migrate`); see "Hosting"
- copy-data.sh copy | empty — the nine tables from the old database into
  the new one, or out again (job `rac-copy-data`)
- set-secret.sh random | ask | stdin NAME — a value into Secret Manager
  without showing it
- deploy/render-service.sh — fills in the Cloud Run service definition

## Page UI — /admin/patient-signin

### Admin Login Screen (/admin/login)

- One "Sign in with Google" button (no password field)
- Clean, minimal — staff-facing only; in the staff look (a panel on the
  theme's photo — see "Staff look")

### Kiosk Screen (main UI) — two modes:

The kiosk page has NO link to any other staff page (do not add one back):
the tablet is left with patients, and a corner icon was a one-tap door to
patient search and PIN resets.

#### Kiosk pairing (migration 0018 — must be applied to pair)

The tablet used to run on a staff member's Google sign-in, which made it
a signed-in staff browser in the waiting room. It is now paired once as a
device, exactly like the TV (display-auth.ts; shared step 1 in
src/lib/pairing-server.ts), with its own table (kiosk_devices) and cookie
(rac_kiosk, httpOnly, 400 days, re-set on use).

- Flow: tablet opens /admin/patient-signin → set-up screen ("Please see
  the front desk" + Staff: "Show pairing code") → 6-char code → staff
  choose "Check-in kiosk" in Dashboard → Screens and type it → the PIN pad
  appears by itself. Code: src/components/kiosk/kiosk-gate.tsx, which
  stands in front of signin-keypad.tsx.
- A kiosk is never staff (do not regress). A browser carrying a rac_kiosk
  cookie gets no staff page — the login page included — and no staff API,
  whatever Google session it also holds: adminPageGate redirects it to
  the kiosk, getAdminEmail() returns null. Only the cookie's SHAPE is
  checked for this (src/lib/device-cookie.ts, Edge-safe); a forged one
  only takes access away. Whether the pairing is real is checked against
  the database by the kiosk's API routes.
- The exit is the dashboard: Revoke in Screens. The tablet's next status
  check answers "none" and clears the cookie, making it an ordinary
  browser again. An APPROVED kiosk cannot clear its own cookie (DELETE
  /api/kiosk/pair answers 409).
- The page never asks for a code by itself — only on the "Show pairing
  code" tap. Asking sets the cookie, and a staff member who merely opened
  the kiosk page on their own computer must not be locked out of the
  dashboard. (They get the PIN pad through their staff session.)
- Staff say what they are pairing, and the code is looked up only in that
  kind's table: a kiosk can do more than a screen (PIN lookup, PIN setup,
  check-in), so a kiosk code typed as a TV is "not found". Separate
  tables also mean a TV cookie can never open the kiosk's routes.
- A staff session still opens the kiosk's routes, so an unpaired tablet
  keeps working the old way ("Sign in as staff instead"), and staff can
  try the kiosk on their own computer.
- The gate re-checks every 60 s while the PIN pad is up (notices a
  revoke, keeps the cookie and "last seen" fresh). "error" (the pairing
  could not be checked) never takes a working PIN pad away; on load it
  shows "One moment, please" and retries. A 401 from a kiosk route
  re-checks instead of going to the staff login.
- The set-up and code screens follow the kiosk rules: TapButton, the
  350 ms screen-change guard, dvh sizes, fit 1024×700 and 768×950.

Written for patients who are not comfortable with screens. Three rules:
one question per screen in plain words; nothing changes without the
patient seeing why (no screen swaps for spinners); no dead ends. Code:
src/components/signin-keypad.tsx (screens), src/components/kiosk/
(number-pad, digit-slots, tap-button), src/lib/kiosk-entry.ts (what a key
press does — pure, tested), src/lib/tap-guard.ts.

Input rules (do not regress these — each fixes a way presses were lost):

- Number keys fire on touch-DOWN (pointerdown), not on click: click drops
  presses when a finger drifts, holds, or a second finger lands early.
  Other buttons (TapButton) fire on lift if the finger is still on them.
- Typed values go through reducers, never `value + digit` from a closure.
- NumberPad / TapButton are module-level components (a component defined
  inside the screen is rebuilt on every digit).
- touch-action: manipulation on the kiosk (no double-tap zoom, so "2200"
  is four presses); touchend is preventDefault-ed (no ghost clicks).
- For ~350 ms after any screen change all kiosk buttons ignore presses,
  so a double tap can't answer the next screen (Continue → Cancel sit in
  the same place).
- A notice must never move the pad: PadScreen reserves the notice slot.
- The confirmation dialog cannot be dismissed by tapping outside it, and
  does not catch touches while fading out.
- Layout scales with dvh and goes two-column in landscape; every screen
  must fit 1024×700 and 768×950 without scrolling.
- The page is pinned: no scroll, bounce, pan or zoom in any direction, by
  finger, wheel, trackpad or pinch. Three layers — `html.kiosk-locked` in
  globals.css (fixed body, no overflow/overscroll), touch-action: none on
  the kiosk, and src/components/kiosk/use-scroll-lock.ts cancelling
  wheel / touchmove / Safari gesture events. Buttons use pointer events,
  which that does not affect.

**Returning Patient**

- "Sign in — Tap your 4-digit PIN": four boxes, the next box outlined;
  the number just pressed is shown as a digit and turns into a dot when
  the next one is pressed (owner's decision — proof of what registered);
  pad is 1–9 / Clear · 0 · Delete; physical numpad also works
- The 4th digit checks the PIN by itself ("Checking…" under the boxes; the
  value is locked while checking)
- On match: "Is this you? / Is this your appointment?" with name +
  appointment time, big "Yes — check me in" / "No, that's not me"
- On confirm: log check-in, show "Thank you [first name]!" and "Please
  have a seat — your name and room will appear on the screen" for 8 s (or
  "Done"), reset
- Re-check-in within 4 hours: no duplicate row; shows "You're already
  checked in" instead
- On no match: stays on the pad with "We don't recognize that PIN. Please
  try again, or ask the front desk for help."
- Idle: after 40 s without a touch mid-flow, "Are you still there?" with a
  countdown; at 60 s the kiosk resets to the PIN pad (abandoned flows must
  not leave patient info on screen). Replies from the server that arrive
  after a reset are dropped.

**New Patient** ("First time here? Create your PIN")

- Step 1 of 3: "What is your phone number?" on the same big number pad,
  formatted as typed; "Use my email instead" switches to a text field.
  The lookup matches a phone stored with or without a leading 1.
  - Both emails and phones can match MULTIPLE patients (family members
    share contact info, esp. in the legacy PB import). Resolution: zero
    matches → "We couldn't find you" (Try again / Back to sign in); all
    matches have PINs → "You already have a PIN"; exactly one match
    without a PIN → proceed with that patient; several without PINs →
    "Which one is you?" listing each PIN-less match as first name + last
    INITIAL (never full last name). Patients who already have a PIN are
    never listed.
- Step 2 of 3: "Create your PIN" — two rows on one screen, "1 Choose 4
  numbers" and "2 Type the same 4 numbers again"; the digits are SHOWN
  here (owner's decision, so patients can check and remember them). A
  mismatch or an already-used PIN restarts the choice on the same screen
  with the reason. Then "Your PIN is saved" shows it once more and moves
  on by itself after 7 s.
- Step 3 of 3: the same confirmation as a returning patient
- On success: hash with bcrypt, save to patients table, proceed to
  appointment confirmation as a normal check-in

## Security Notes

- PINs hashed with bcryptjs (never stored plain text); the lookup
  fingerprint beside the hash is keyed with a server-only secret
- All DB and API calls in server-side API routes only
- Supabase service role key used server-side only; RLS enabled with no
  policies, so the anon key can read nothing
- On Google Cloud: the database listens only inside the Cloud Run
  instance (PostgREST and the Cloud SQL Auth Proxy on loopback); PostgREST
  has no anonymous role, so only the app's token (DB_REST_JWT,
  server-side only) gets anything; RLS stays on with one policy per
  table, for the app's role alone; the service is reachable only through
  the load balancer; every secret is in Secret Manager
- The staff pages' redirect to the login page (src/middleware.ts) is a
  convenience, not the protection: on next 15.1.11 a crafted header
  skips it unless the host removes that header (see "Hosting"). What
  protects staff data is the check inside every staff route (staffRoute)
- Staff auth = Google sign-in (NextAuth) restricted to ALLOWED_ADMIN_EMAILS;
  no shared password exists
- Patient API routes require a paired kiosk or the staff session (401
  otherwise)
- The check-in kiosk authenticates with a staff-approved device cookie
  that opens only the kiosk's own routes; a browser carrying one is never
  treated as staff
- Staff sign-ins end at 3 am clinic time; the dashboard has Sign out
- Dashboard patient searches, PIN resets, staff check-ins, check-in
  history views and exports, removals from the rooms board and device
  pairing are recorded
  in staff_audit_log (who, when, which patients); patient names are never
  put in a request address
- setup-pin PATCH refuses to overwrite an existing PIN (403) and enforces
  PIN uniqueness across patients
- Failed PIN lookups rate limited durably in Supabase (fails closed)
- No patient data logged to console. A caught error is logged only as
  `errorLabel(error)` (src/lib/error-label.ts, tested): its kind, a code,
  a status — never its message or the object, which often quote the row
  or the address being handled. error-label.test.ts fails if a file under
  src/ hands a caught error to console.* directly.
- Every answer of a staff route and of a kiosk route is `Cache-Control:
  no-store`: staffRoute and kioskRoute set it themselves (neverCached,
  staff-route.ts), so a route cannot forget.
- /admin/\* routes protected by middleware.ts (the login page and the
  kiosk page shell are open; the kiosk shell holds no patient data)
- Waiting-room screens authenticate with a staff-approved device cookie;
  they can read only "First L." + room name of patients being called,
  the music setting, and a one-hour Spotify access token (which can play
  and control music on the clinic's Spotify account — nothing else)
- The Spotify refresh token is stored encrypted and is never sent to a
  browser; outside scripts/frames are allowed on /waiting-room only
