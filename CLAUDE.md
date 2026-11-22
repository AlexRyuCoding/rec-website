# Patient Sign-In Redesign — ryuacupuncture.com

## Project Overview

Redesigning the hidden patient check-in page at /admin/patient-signin.
Patients check in physically using a 4-digit PIN. The page is kiosk-style —
the tablet is paired once as a kiosk device (see "Kiosk pairing"), then
patients use it unassisted; it needs no staff sign-in.

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

- /admin/patient-signin — the kiosk page. The page shell is public and
  holds no patient data (like /waiting-room): it has to open on a tablet
  with no credentials, to show a pairing code. Its API routes answer only
  a paired kiosk or a staff session
- /admin/dashboard — staff dashboard, three tabs: Check-ins (today or
  any range: where each visit stands and how long patients waited — see
  "Dashboard check-ins"), Patients (search with Check in + Reset PIN) and
  Setup (paired screens and kiosks, waiting-room music, Practice Better
  sync). The header shows who is signed in and has Sign out. ?tab=patients
  opens the search directly (the rooms board's "Check in a patient"
  link); ?tab=setup, or the way back from Spotify, opens Setup
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
- /api/cron/keepalive — daily Vercel Cron ping (Bearer CRON_SECRET) so the
  free-tier Supabase project never pauses for inactivity
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
- Every staff API route must get its session through getAdminEmail() /
  isAdminAuthorized() (src/lib/admin-auth.ts). A route that calls
  getServerSession itself skips the day's-end check.
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
  require a paired kiosk OR a staff session via isKioskAuthorized()
  (src/lib/kiosk-auth-server.ts) — 401 without. The webhook route is
  public but HMAC-signature verified.
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

Records from Practice Better: the webhook, the dashboard sync and
scripts/sync-patients.js all turn a PB client record into a patients row
with toPatientRow (src/lib/patient-record.ts; the script keeps a copy of
the same rules, and patient-record.test.ts runs both). Names lose the
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
- Without 0014 the route falls back to a plain word-by-word query (no
  accents, no typos) and logs a warning — search must not go down because
  a migration was not applied yet.
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
- Without 0017, or without NEXTAUTH_SECRET, everything works as before
  (compare against everyone) — the kiosk must never depend on it.
- Why an HMAC and not a plain hash: with only 10,000 possible PINs any
  unkeyed hash is reversed by trying them all; the key lives only on the
  server.

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
  board's "flow-updated" hint, and once a minute. A refresh never blanks
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
- Errors on the dashboard use one red (text-error / bg-error).

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

## Staff audit log (migrations 0015 + 0016 — should be applied)

staff_audit_log: one row per dashboard patient search (the text typed and
the ids of the patients listed), per PIN reset and per staff check-in —
id, at, staff_email, action ('patient_search' | 'pin_reset' |
'staff_checkin' — the last needs 0016), patient_ids uuid[], detail.
Written by src/lib/audit-server.ts (recordStaffAction); the staff email
comes from getAdminEmail() in src/lib/admin-auth.ts. There is no page
for it: read it in the Supabase table editor.

- It fails OPEN, by decision: if the row cannot be written (0015 not
  applied, database hiccup) the search / reset still happens and the app
  logs "audit log write failed" with the error code only. The front desk
  must not be locked out of finding a patient by the logbook.
- Searching while typing writes a row per request, so one lookup is
  often 2–4 rows ("an", "ann", "ann lic"). Each one did list patients.
- Nothing prunes the table.
- RLS on, no policies; patient_ids is deliberately not a foreign key
  (the record outlives the patient).

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
  ding-dong ×3; timer done = kitchen-timer beeps (very high, pulsed),
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
- Every call has a timeout (PB_TIMEOUT_MS, 5 s; 20 s for a page of the
  bulk sync): a request that never settles must not hold a kiosk
  check-in — it fails open like an outage does
- Get today's sessions for a client:
  GET /consultant/sessions?records={pb_client_id}&date_eq={today}
- Get a single client record: GET /consultant/records/{id}
- All Practice Better calls happen in Next.js API routes (server-side only)

## Scripts

### scripts/sync-patients.js

- Authenticates with Practice Better API
- Fetches all client records (GET /consultant/records, paginated)
- Upserts into Supabase patients table using pb_client_id as the unique key
- Cleans each record on the way in — see "Records from Practice Better"
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

- One "Sign in with Google" button (no password field)
- Clean, minimal — staff-facing only

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
  keeps working the old way ("Sign in as staff instead") and nothing
  breaks before 0018 is applied.
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
- Staff auth = Google sign-in (NextAuth) restricted to ALLOWED_ADMIN_EMAILS;
  no shared password exists
- Patient API routes require a paired kiosk or the staff session (401
  otherwise)
- The check-in kiosk authenticates with a staff-approved device cookie
  that opens only the kiosk's own routes; a browser carrying one is never
  treated as staff
- Staff sign-ins end at 3 am clinic time; the dashboard has Sign out
- Dashboard patient searches, PIN resets and staff check-ins are recorded
  in staff_audit_log (who, when, which patients); patient names are never
  put in a request address
- setup-pin PATCH refuses to overwrite an existing PIN (403) and enforces
  PIN uniqueness across patients
- Failed PIN lookups rate limited durably in Supabase (fails closed)
- No patient data logged to console
- /admin/\* routes protected by middleware.ts (the login page and the
  kiosk page shell are open; the kiosk shell holds no patient data)
- Waiting-room screens authenticate with a staff-approved device cookie;
  they can read only "First L." + room name of patients being called,
  the music setting, and a one-hour Spotify access token (which can play
  and control music on the clinic's Spotify account — nothing else)
- The Spotify refresh token is stored encrypted and is never sent to a
  browser; outside scripts/frames are allowed on /waiting-room only
