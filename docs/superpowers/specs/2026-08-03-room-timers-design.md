# Room Timers — Design Spec

Date: 2026-08-03
Status: Approved by Alex Ryu

## Purpose

A staff-facing clinic room timer board at `/admin/rooms`. Staff lay out tiles
in a grid that mirrors the clinic floor plan (top-down), then run a countdown
timer per room during treatment. Status is color-coded, an alarm chimes when
time is up, and all state syncs in real time across every open device
(computer, phone, tablet).

## Decisions made during brainstorming

- **Status lifecycle is derived from the timer**, never set by hand:
  start → In Use; timer hits 0:00 → Complete/Remove Needles + alarm; 5 minutes
  past zero without being cleared → Overtime. The ✓ button clears the room
  back to Available.
- **Alarm sounds on all devices** and repeats (~every 45 s) until the room is
  cleared.
- **Layout = rooms placed on grid cells.** Uniform tile size; gaps allowed so
  the board can mirror the clinic's real shape.
- **Tiles are anonymous** (no patient names / PHI). Each room can instead have
  an assignable **practitioner name**, set in edit-layout mode and shown on
  the tile.
- **Sync = Option A**: Supabase is the source of truth; Supabase Realtime
  broadcast makes updates instant; timers are stored as timestamps so
  countdown correctness never depends on the network.

## 1. Route & page

- New page `/admin/rooms`, protected by the existing `/admin/*` middleware
  (NextAuth Google + `ALLOWED_ADMIN_EMAILS`). Linked from the dashboard.
- Two modes: **Live view** (default) and **Edit layout** (header toggle).
- Uses the existing single dark theme.

## 2. Data model — migration `0008_rooms.sql`

One new table, `rooms`. Idempotent DDL, RLS enabled with no policies (service
role only), matching existing migrations.

| column                   | type              | notes                                          |
| ------------------------ | ----------------- | ---------------------------------------------- |
| id                       | uuid              | primary key                                    |
| name                     | text              | e.g. "Room 1"                                  |
| grid_row                 | int               | position; (grid_row, grid_col) unique          |
| grid_col                 | int               |                                                |
| practitioner_name        | text, nullable    | assigned doctor, shown on tile                 |
| default_duration_seconds | int               | per-room default; initial 900 (15:00)          |
| timer_started_at         | timestamptz, null | null = no active session                       |
| timer_duration_seconds   | int, nullable     | duration of the running session                |
| timer_paused_at          | timestamptz, null | set while paused                               |
| updated_at               | timestamptz       | for change detection                           |

### Timer semantics (pure timestamp math — no server ticking)

- elapsed = (`timer_paused_at` ?? now) − `timer_started_at`
- remaining = `timer_duration_seconds` − elapsed
- Resume rewrites `timer_started_at = now − elapsed` and nulls
  `timer_paused_at`.
- ± buttons add/subtract 60 s to `timer_duration_seconds` (before or during a
  session; remaining may not drop below 0 via adjust).

### Status derivation (pure function of row + now)

| condition                              | status                   | color  |
| -------------------------------------- | ------------------------ | ------ |
| `timer_started_at` is null             | Available                | green  |
| remaining > 0                          | In Use (frozen if paused)| blue   |
| −5 min < remaining ≤ 0                 | Complete / Remove Needles| orange |
| remaining ≤ −5 min                     | Overtime                 | red    |

- The 5-minute grace period is a code constant (`OVERTIME_GRACE_SECONDS`).
- Complete/Overtime tiles show count-up past zero (e.g. `+2:30`).
- A paused timer never crosses zero (elapsed is frozen), so it stays In Use.

## 3. API routes

All under the staff session guard (`isAdminAuthorized()`, 401 otherwise),
service-role Supabase client, server-side only.

- `GET /api/admin/rooms` — all rooms plus `serverTime` (ISO). Clients compute
  a clock-skew offset from `serverTime` so devices with wrong clocks still
  render identical countdowns.
- `POST /api/admin/rooms` — create room `{ name, gridRow, gridCol }`.
- `PATCH /api/admin/rooms/[id]` — edit `name`, `gridRow`/`gridCol`,
  `practitionerName`, `defaultDurationSeconds`.
- `DELETE /api/admin/rooms/[id]` — remove room.
- `POST /api/admin/rooms/[id]/timer` — body
  `{ action: "start" | "pause" | "resume" | "reset" | "adjust" | "clear", deltaSeconds? }`
  - `start`: begin session at the room's `default_duration_seconds`
  - `pause` / `resume`: as per timer semantics above
  - `adjust`: ±`deltaSeconds` (60). While a session is running, edits
    `timer_duration_seconds`; on an Available room, edits
    `default_duration_seconds` (persisted per room)
  - `reset` and `clear`: both end the session (clear the three `timer_*`
    fields) and return the room to Available showing its default duration.
    They are deliberately identical in effect — two buttons for two intents
    (reset = abandon mid-session, ✓ clear = treatment finished)
- Zod-validated bodies. Position conflicts (occupied cell) → 409.
- After every successful mutation the route broadcasts `rooms-updated` on a
  Supabase Realtime broadcast channel (server-side supabase-js).

## 4. Live view & sync (client)

- On load: `GET /api/admin/rooms`, store rows + clock offset.
- Subscribe to the Realtime broadcast channel using the anon key. Broadcast
  channels don't read tables, so the "anon key reads nothing" RLS posture is
  unchanged. On any `rooms-updated` message → refetch.
- Fallbacks: refetch every 60 s, and on `visibilitychange`/`online`.
- A 1-second local tick recomputes remaining/status from timestamps — display
  accuracy never depends on the network.
- Tile contents: room name, practitioner name, `− MM:SS +`, start/pause,
  reset, ✓ clear, status label. Colors: green/blue/orange/red per the table
  above (matches wireframe).
- Buttons disable while their request is in flight; on failure show a brief
  toast and refetch.

## 5. Alarm & device behavior

- When a device's local tick sees remaining cross ≤ 0 for a room, it plays a
  soft two-tone chime (Web Audio API, generated — no audio asset), repeating
  every ~45 s until the room is cleared. (A completed timer cannot be paused;
  clearing is the only way to silence it.)
- Browsers block audio before first user interaction: show a one-tap
  "Enable sound" banner once per session on each device.
- Request a screen wake lock (`navigator.wakeLock`) where supported; staff
  instructions should also set wall tablets to never sleep.

## 6. Edit layout mode

- Header toggle switches the grid into edit mode: empty cells become visible
  (6 columns; rows grow as needed).
- Tap an empty cell → create-room dialog (name, optional practitioner name).
- Tap a room → edit sheet: rename, practitioner name, default duration,
  delete, or **move** (tap room, then tap a destination cell — no
  drag-and-drop).
- Every action saves immediately via the API and broadcasts, so other devices
  see layout changes live. No draft state.

## 7. Error handling summary

- Realtime channel down → 60 s poll keeps devices eventually consistent;
  countdown display is unaffected (local math).
- PB/other systems: not involved — this feature touches only Supabase.
- API failures → toast + refetch; no optimistic state to unwind.
- Deleting a room with a running timer is allowed (edit mode is deliberate).

## 8. Testing

- Unit tests (alongside `src/lib/validation.test.ts` conventions) for the
  status-derivation module: available/in-use/paused/complete/overtime
  boundaries, adjust clamping, resume timestamp rewriting, clock-offset
  application.
- Manual QA: two browsers side by side — start/pause/adjust/clear sync,
  alarm firing on both, layout edits appearing live.

## Out of scope (explicitly)

- Patient names / check-in linkage on tiles (may be added later).
- Free-form floor-plan canvas, room resizing, drag-and-drop.
- Per-room alarm sounds, alarm volume settings, sound on/off per device.
- History/analytics of room usage.
