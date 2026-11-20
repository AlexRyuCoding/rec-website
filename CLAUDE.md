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
- SPOTIFY_CLIENT_ID= / SPOTIFY_CLIENT_SECRET= (optional; a Spotify developer app, only needed for Spotify as the waiting-room music source. Its Redirect URI must be https://www.ryuacupuncture.com/api/admin/spotify/callback)
- SPOTIFY_REDIRECT_URI= (optional; local dev only — Spotify refuses "localhost", so use http://127.0.0.1:3000/api/admin/spotify/callback)

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
  API needs a paired-screen cookie or a staff session. Shown on a 42-inch
  TV across the waiting room: sizes are in vh only, and anything patients
  must read is at least text-[5.5vh] (~2 cm letters; the music bar in the
  header is ambience and is deliberately smaller). It always shows a
  clock with seconds and a door reminder ("When you enter your room,
  please close the door, but leave it slightly open." with a large
  door-open icon); the call list sizes itself to the space above that
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

waiting_room_music (0012): a single row — source, the link for each
source, volume, paused, and the encrypted Spotify refresh token.
radio_stations (0013): staff's saved radio stations — name + unique
stream address.

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
  "Doctor in" button) and rings the doorbell sound when it appears. It cannot be
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
- Alert sounds are defined as data in src/lib/sounds.ts and must stay
  unmistakably different from one another in melody, tone colour, rhythm
  AND pitch range (sounds.test.ts enforces it — keep those tests when
  retuning). Staff board (useAlarm.ts): patient waiting = doorbell
  ding-dong ×3; timer done = kitchen-timer beeps (very high, pulsed),
  repeating every 20 s until ✓; overtime (5 min past zero) = low buzzing
  two-tone alarm, repeating the same way; a board with both plays both in
  turn. Waiting-room TV: a soft rising four-note chime per call, and once
  when sound is switched on. The board's "Sounds" button lets staff play
  each one.
- Patient names leave the server only as "First L." (display_name).
- NEVER put patient data in a Realtime broadcast: the channel is readable
  with the public anon key. Room broadcasts carry anonymous room rows;
  the "flow-updated" event has an empty payload and just means "refetch".
- Waiting-room TV pairing: TV opens /waiting-room → shows a 6-char code →
  staff enter it in Dashboard → Screens → the TV's httpOnly rac_display
  cookie (id + secret; only the hash is stored) now authorises that one
  screen until revoked. No env var involved.

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
  stream's address and name, not a link to the row. Without 0013 the
  panel still works with the presets and just hides "Add to My stations". A dropped or stalled stream reconnects by
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
  they can read only "First L." + room name of patients being called,
  the music setting, and a one-hour Spotify access token (which can play
  and control music on the clinic's Spotify account — nothing else)
- The Spotify refresh token is stored encrypted and is never sent to a
  browser; outside scripts/frames are allowed on /waiting-room only
