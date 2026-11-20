# Patient Room Flow — Design Spec

Date: 2026-11-19
Status: Approved by Alex Ryu

## Purpose

Connect the kiosk check-in to the room timer board so patients move in and
out of rooms with far less running around:

1. A patient checks in at the kiosk and appears in a **waiting list** on the
   staff rooms board.
2. A staff member **assigns** the patient to a room.
3. A **waiting-room screen** (a TV) tells the patient which room to go to —
   now if the room has a free bed, or automatically the moment the room is
   marked ready if it is still in use.
4. The room's tile on the board switches to **Patient waiting**, tagged with
   the patient's doctor, so the doctor knows where to go.
5. Starting the timer ends the alert. When the timer is done, ✓ silences
   the alarm and the room is **Turning over**; **Room ready** finishes the
   visit and calls whoever is lined up next.

## Decisions made with Alex

- **Staff assign rooms; the system never picks one.** (Automatic room
  selection was considered and dropped.)
- **Patients are told on a waiting-room screen.** No text messages.
- **The waiting-room screen is a TV / TV stick left running**, so it
  cannot depend on the daily staff Google sign-in. It gets its own
  long-lived pairing (§8).
- **Doctors are told on the rooms board** (tile state + chime). No texts.
- **Staff may line a patient up behind a busy room** ("next up"); that
  patient is called automatically when the room becomes ready.
- **Staff tap ✓ when they go in to remove needles**, while the patient is
  still in the room. So ✓ must not call the next patient: it silences the
  alarm and starts **Turning over**; a second tap, **Room ready**, frees
  the room.
- **Names are shown as first name + last initial** ("Alex R.").
- **The room's doctor pill is set automatically** from the patient's
  Practice Better appointment when the patient is called to the room.
- **Room 5 (two beds)** takes two patients on **one shared timer**; staff
  assign both. Nothing is inferred about who belongs together. If one
  finishes early, staff remove just that name.

Everything below that is not in this list is the designer's call and is
marked *(call)* where it matters.

## Non-goals

- Automatic room selection or suggestions.
- SMS / push notifications.
- Detecting couples from PB data.
- Per-bed timers.
- Showing today's not-yet-arrived appointments on the board.
- Room usage history / analytics beyond the timestamps stored below.

## Anti-goals

- Patient names must never travel over the Supabase Realtime broadcast
  channel. That channel is readable with the public anon key; today it only
  carries anonymous room rows. Flow broadcasts are content-free "something
  changed, refetch" hints.
- The check-in must never fail or slow down because of this feature (PB
  down, no appointment, no doctor match → patient still checks in and
  still appears in the waiting list).
- A patient must never be sent into a room that still has someone in it.
- Staff can still run the board without assigning anyone: start, pause,
  adjust, alarm, layout editor and optimistic updates keep working for a
  room with no tracked patient. The one deliberate change is that ✓ now
  leads to Turning over → Room ready on every room *(call: green must
  always mean "actually free", tracked patient or not)*.

## 1. Data model — migration `0011_patient_flow.sql`

Idempotent, RLS enabled with no policies (service role only), same style
as 0007–0010. **Must be pasted into the Supabase SQL editor before
deploy.**

`rooms`

| column              | type              | notes                                   |
| ------------------- | ----------------- | --------------------------------------- |
| capacity            | int               | not null, default 1, check 1–4. Beds.   |
| turnover_started_at | timestamptz, null | set by ✓; cleared by Room ready         |

`checkins` (one row = one visit; the flow state lives on it)

| column            | type        | notes                                                        |
| ----------------- | ----------- | ------------------------------------------------------------ |
| practitioner_name | text, null  | PB doctor name, snapshotted at check-in like `service_name`  |
| room_id           | uuid, null  | → rooms.id, `on delete set null`                             |
| room_assigned_at  | timestamptz | null until staff assign a room                               |
| called_at         | timestamptz | null until the patient is told to go to the room             |
| seen_at           | timestamptz | null until the room's timer is started                       |
| done_at           | timestamptz | null until the visit is finished or removed from the list    |

Backfill so the board doesn't open with old check-ins in the waiting
list: inside a `do $$ ... $$` block, only when the `done_at` column does
not exist yet, add it and set `done_at = checked_in_at` on all existing
rows. Re-running the file is then a no-op. Partial index on
`checkins (checked_in_at) where done_at is null`.

`display_devices` (new; paired waiting-room screens, §8)

| column       | type              | notes                                            |
| ------------ | ----------------- | ------------------------------------------------ |
| id           | uuid              | primary key                                      |
| code         | text              | 6-character pairing code shown on the TV         |
| secret_hash  | text              | sha256 of the device secret held in its cookie   |
| label        | text, null        | e.g. "Waiting room TV", set by staff at approval |
| created_at   | timestamptz       |                                                  |
| created_ip   | text, null        | for the pairing rate limit                       |
| approved_at  | timestamptz, null | null = pending                                   |
| approved_by  | text, null        | staff email                                      |
| revoked_at   | timestamptz, null |                                                  |
| last_seen_at | timestamptz, null | updated at most once a minute                    |

### Visit state (pure function of the row)

An **active visit** is a check-in with `done_at is null` and
`checked_in_at` within the last 12 hours *(call: 12 h window instead of
"clinic-local today" — no timezone math, and yesterday's leftovers drop
off by themselves)*.

| state    | condition                                 | where it shows                          |
| -------- | ----------------------------------------- | --------------------------------------- |
| waiting  | `room_id` null                            | waiting list on the board               |
| next_up  | `room_id` set, `called_at` null           | "Next: Alex R." on the room tile        |
| called   | `called_at` set, `seen_at` null           | room tile + waiting-room screen         |
| treating | `seen_at` set                             | room tile (name only)                   |

An **occupant** of a room is a visit in `called` or `treating` for that
room.

### Room status

`deriveRoomState` takes the room's occupant count and gains two statuses.
Evaluated in this order:

1. timer running → `in_use` / `complete` / `overtime`, exactly as today
2. `turnover_started_at` set → `turnover` (slate tile, "Turning over")
3. at least one occupant → `patient_waiting` (purple tile, "Patient
   waiting", shows minutes since the oldest unseen `called_at`)
4. otherwise → `available`

## 2. Transitions

All server-side, in one pure module (`src/lib/patient-flow.ts`) that takes
the room, the room's visits and `now` and returns the row updates, so it
is unit-testable the same way `room-status.ts` is.

**Free bed now.** A room can take a patient immediately when it is not
turning over AND occupants < capacity AND nobody is already lined up for
it AND (no timer is running OR the room already has at least one
occupant). The last clause lets a late partner join Room 5 mid-treatment,
while a room whose timer was started by hand for an untracked patient is
treated as busy.

**Assign (visit → room).** Allowed when the visit is active; assigning a
visit that is already in another room moves it.

- Free bed now → set `room_id`, `room_assigned_at`, `called_at = now`.
- Otherwise the patient is **next up**: set `room_id`,
  `room_assigned_at`, leave `called_at` null. Allowed while the next-up
  count < capacity; beyond that → 409 "Room 5 already has patients lined
  up".

**Calling.** Whenever a visit's `called_at` is set (assign or promotion),
the room's `doctor_name` is set from the visit's `practitioner_name` if it
matches exactly one roster doctor (§3). Otherwise the pill is left alone.

**Promotion rule.** After *every* transition that touches a room, the
server re-checks it: if the room has no timer running, is not turning
over, and has free beds, lined-up visits are called, oldest
`room_assigned_at` first, until the beds are full. This is a rule, not a
side effect of one button, so a no-show, a moved patient, or a reset of a
hand-started timer can never strand someone who is lined up. It never
fires while a timer is running or during turnover.

**Timer start.** All `called` visits in the room get `seen_at = now`. The
tile becomes In Use and keeps showing the names. Not available while
turning over.

**✓ (clear).** Timer fields clear and `turnover_started_at = now`. The
alarm stops. Occupants stay on the tile. Nobody is called.

**Room ready.** New timer action `ready`, only valid in `turnover`:
`turnover_started_at = null`, occupants get `done_at = now`, then the
promotion rule runs (tile goes to Patient waiting if someone was lined
up, otherwise Available).

**Timer reset.** Timer fields clear as today; no turnover. Occupants stay
and their `seen_at` is nulled, so a tracked room returns to Patient
waiting *(call: reset means "the timer was a mistake", not "the patient
is done")*. The promotion rule then runs — it does nothing if the beds
are still taken, and calls a lined-up patient if the timer had been
hand-started for nobody.

**Unassign (back to waiting list).** Clears `room_id`, `room_assigned_at`,
`called_at`, `seen_at`. Promotion rule runs on the room left behind.

**Remove.** Sets `done_at = now` (no-show, left, finished early in Room
5, handled another way). Works from the waiting list and from a room.
Promotion rule runs on the room.

**Late partner (called into a room whose timer is already running).**
`seen_at` stays null; the tile stays In Use and the name appears marked as
arriving for 10 minutes; the doctor chime plays; the waiting-room screen
shows the call for the full 10 minutes. The visit finishes with the rest
of the room on Room ready. No per-patient "seen" action.

**Room deleted.** `on delete set null` returns its visits to the waiting
list; the read path treats `room_id` null as `waiting` regardless of the
other timestamps.

Concurrency: read-then-write, last write wins, as the timer route does
today. Two staff assigning into the last bed at the same instant can
overfill a room by one; the tile shows both names and staff move one. Not
worth a transaction for one clinic.

## 3. Matching the PB doctor to the roster

Pure function `matchRosterDoctor(pbName, roster)`: lowercase, strip
punctuation and the tokens `dr`, `lac`, `dacm`, `daom`; a roster doctor
matches when every token of its name appears in the PB name's tokens
(roster "Ryu" or "Alex" or "Alex Ryu" all match PB "Alex Ryu"). Exactly
one match → that doctor. Zero or several → no change. Staff can always
set the pill by hand as today.

Consequence for the clinic: roster names need to be recognisable pieces of
the PB practitioner names. If two doctors share a last name, the roster
entries need first names.

## 4. Check-in changes

`POST /api/checkins` already fetches today's PB session. It additionally
stores `practitioner_name`, and after a successful insert sends a flow
hint broadcast so boards refetch. Behavior on PB failure is unchanged
(nulls). The 4-hour duplicate guard is unchanged.

Kiosk success copy changes from "You're checked in." to "You're checked
in. Please have a seat — your name and room will appear on the screen."

Known limitation *(call)*: a patient removed from the waiting list by
mistake cannot re-appear by checking in again within 4 hours (duplicate
guard). Staff walk them to a room and run the timer by hand.

## 5. API

Staff routes: behind `isAdminAuthorized()`, zod-validated, service-role
client.

- `GET /api/admin/rooms` — additionally returns `visits`: every active
  visit as `{ id, display_name, appointment_at, practitioner_name,
  checked_in_at, room_id, room_assigned_at, called_at, seen_at }`
  (snake_case, like the room rows). `display_name` is built on the server
  ("Alex R."); the full last name is not sent.
- `POST /api/admin/visits/[id]` — body `{ action: "assign", roomId }`,
  `{ action: "unassign" }` or `{ action: "remove" }`. Returns the updated
  visits and any changed rooms. 404 unknown/inactive visit, 409 room full.
- `POST /api/admin/rooms/[id]/timer` — new action `ready`; `start`,
  `clear`, `reset`, `ready` also apply the visit updates from §2 and
  return `visits` alongside `room`.
- `PATCH /api/admin/rooms/[id]` — accepts `capacity` (1–4).
- `GET /api/admin/displays` — paired and pending screens.
  `POST /api/admin/displays/approve` `{ code, label? }`.
  `DELETE /api/admin/displays/[id]` — revoke.

Display routes (§8): `POST /api/display/pair`, `GET /api/display/calls`.

Realtime: a second event `flow-updated` on the existing `room-timers`
channel with an **empty payload**. Sent after check-in and after any visit
change. Clients respond by refetching. Room-row broadcasts continue as
today and never include patient data.

## 6. Staff board (`/admin/rooms`)

- **Waiting list** — a strip above the grid, shown only in live view. One
  chip per waiting patient, oldest check-in first: name, appointment time,
  doctor (colored dot when it matches the roster), minutes waited. Empty
  state: a single muted line "No one waiting".
- **Assigning** — tap a chip to select it; every room tile then shows an
  overlay button: "Send here" (free bed now), "Next up here" (busy or
  turning over), or a disabled "Full". Tapping one assigns; tapping the
  chip again or anywhere else cancels. Same two-tap pattern the layout
  editor uses for moving rooms; no drag-and-drop.
- **Chip ×** — removes the patient from the list after a confirm tap.
- **Room tile** — under the doctor pill, occupant names ("Alex R.", or
  "Maria S. · Daniel S." in Room 5); a smaller "Next: …" line for lined-up
  patients. Tapping a name opens a small menu: "Back to waiting list" /
  "Remove".
- **Patient waiting** — purple tile, label "Patient waiting", the timer
  area still shows the default duration with Start, plus a small
  "waiting 3:20" counter.
- **Turning over** — slate tile, label "Turning over", occupant names
  still shown, one large "Room ready" button in place of the timer
  controls. No alarm.
- **Doctor chime** — whenever a visit becomes `called`, every board with
  sound enabled plays one short, distinct chime (rising two-tone, so it is
  not mistaken for the falling "remove needles" chime). It does not repeat
  *(call: the tile and its counter carry the reminder; a repeating alarm
  would compete with the needle alarm)*.
- **Layout editor** — the room edit sheet gains a "Beds" stepper (1–4).
- New-arrival cue: when a patient joins the waiting list the strip
  animates the chip in; no sound *(call)*.

## 7. Waiting-room screen (`/waiting-room`)

- Full-screen, existing dark theme, very large serif type readable across
  a room. Each call is one line: **Alex R. → Room 3**. Newest at the top,
  animated in with a brief full-width highlight so it is noticed without
  sound. `noindex`.
- A call is shown from `called_at` until that visit's `seen_at` is set
  (its room's timer started) or 10 minutes have passed, whichever comes
  first *(call)*.
- Empty state: "Please have a seat. Your name will appear here when your
  room is ready."
- Chime on each new call. Browsers only allow sound after one key press
  or tap per page load, so until then a small corner hint reads "Press OK
  to turn on sound"; any remote key / tap unlocks it. The visual call
  never depends on sound.
- Nothing else on the page is interactive and it links nowhere.
- Sync: refetch on `flow-updated` and room broadcasts where the browser
  supports the websocket, plus a 10 s poll that is sufficient on its own
  (TV browsers vary). Screen wake lock requested where supported.
- Not included *(call)*: auto-reloading the page after a deploy. The page
  keeps working against the API until the TV is restarted.

## 8. Pairing the TV (device-code flow)

The page shell at `/waiting-room` is public and contains no patient data.
Data comes only from `GET /api/display/calls`, which requires **either** a
paired device cookie **or** a staff session (so staff can preview it on
their own device).

1. The TV opens `ryuacupuncture.com/waiting-room`. With no valid device
   cookie, the page calls `POST /api/display/pair`. The server creates a
   pending `display_devices` row with a random 6-character code (alphabet
   without 0/O/1/I) and a random 32-byte secret, stores only the secret's
   sha256, and sets an httpOnly, Secure, SameSite=Lax cookie
   `rac_display=<id>.<secret>` (max-age 400 days, re-set on use).
2. The TV shows: "Staff: enter code **K7M4QX** in Dashboard → Screens".
   It polls `/api/display/calls`, which answers 403 `{ pending: true }`.
3. A signed-in staff member enters the code on the dashboard. Approval
   requires the row to be pending and less than 10 minutes old. The TV's
   next poll succeeds and the screen starts.
4. The dashboard "Screens" panel lists paired screens (label, paired on,
   last seen) with **Revoke**. A revoked or unknown cookie puts the TV
   back at step 1 with a fresh code. An expired pending code is replaced
   the same way.

Safeguards: `POST /api/display/pair` is public, so it is rate limited per
IP (10/hour, counted on a `created_ip` column of `display_devices`
itself, fails closed like the form limiter) and pending rows older than a
day are deleted opportunistically. Secrets
are compared in constant time. A paired screen can read exactly one
thing: the display names and room names of patients currently being
called. No new environment variable.

## 9. Error handling

- Visit API failure on the board → existing toast + refetch path.
- Realtime down → polls (60 s board, 10 s screen) keep everything
  eventually consistent.
- Timer route: if the timer write succeeds but the visit update fails, the
  response is still 200 with the room; the next poll shows the true visit
  state. The timer must never be blocked by the flow.
- Screen loses network → keeps its last list, drops calls as they pass
  10 minutes, shows a small "Reconnecting…" mark.

## 10. Testing

- Unit tests (vitest, alongside `room-status.test.ts`) for
  `patient-flow.ts`: visit state derivation incl. the 12 h window and
  deleted-room case; free-bed vs next-up for capacity 1 and 2, incl. the
  hand-started-timer, late-partner, turnover and already-lined-up cases;
  start / clear / ready / reset updates; the promotion rule after
  unassign, remove, move and reset; `matchRosterDoctor` (single, none,
  ambiguous, titles); display-name formatting.
- `room-status.test.ts` extended for `turnover` and `patient_waiting` and
  the `ready` action.
- Unit tests for the pairing helpers: code alphabet, cookie parse,
  constant-time verify, pending expiry.
- Manual QA with two browsers + the screen: check in → appears in list →
  assign to free room → screen calls + tile purple + chime → start → ✓ →
  Room ready; next-up path; Room 5 with two patients and a late partner;
  reset; remove; delete a room with occupants; pair, revoke and re-pair a
  screen.

## 11. Rollout

1. Paste migration 0011 into Supabase.
2. Deploy.
3. In Edit layout, set Room 5 to 2 beds; check roster names against PB
   practitioner names.
4. On the TV, open `ryuacupuncture.com/waiting-room`, enter its code in
   Dashboard → Screens, press OK once for sound. Turn off the TV / stick
   screensaver and sleep.
5. Tell staff: ✓ = needles out, **Room ready** = room is empty.

CLAUDE.md gets the new routes, tables, columns and the broadcast rule.
