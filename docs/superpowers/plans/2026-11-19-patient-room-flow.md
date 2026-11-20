# Patient Room Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kiosk check-ins feed a waiting list on the rooms board; staff assign patients to rooms; a paired waiting-room TV calls the patient; the tile alerts the doctor; ✓ → Turning over → Room ready frees the room and calls whoever is lined up.

**Architecture:** Flow state lives on `checkins` rows (one row = one visit) plus two new `rooms` columns. All transitions are computed by a pure module (`src/lib/patient-flow.ts`) and applied by API routes; clients never compute visit changes, they replace their visit list with what the API returns. Realtime carries only empty "refetch" hints for anything involving patients. The TV authenticates with a device cookie obtained through a staff-approved pairing code.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role, server only), zod 4, vitest, Tailwind, GSAP, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-19-patient-room-flow-design.md`

## Global Constraints

- Patient names never go into a Realtime broadcast payload. `flow-updated` has an empty payload.
- Names leave the server only as `display_name` = first name + last initial ("Alex R.").
- Check-in never fails or blocks on flow code (PB down, no appointment, broadcast failure).
- A timer write never fails because a visit write failed (respond 200 with the room).
- All staff routes: `isAdminAuthorized()` → 401; zod-validated bodies → 400; service-role client.
- Constants (exact): active-visit window 12 h; TV call shown 10 min; capacity 1–4; pairing code 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; pending code valid 10 min; device cookie `rac_display`, max-age 400 days; pair rate limit 10/hour/IP; board poll 60 s; TV poll 10 s.
- Migrations are idempotent and RLS-enabled with no policies.
- No patient data in `console.*`.
- Lint must pass (`npm run lint`) — prettier rejects trailing commas in some positions; follow surrounding style.

## Review Focus

1. **PB unreachable / patient without `pb_client_id` at check-in** → the patient still appears in the waiting list, doctor and appointment blank. (Task 4 test: `toVisitView` with null fields; Task 4 manual check.)
2. **Patient with missing or lowercase/whitespace names** → `displayName` never renders "Alex ." or "undefined U."; (Task 2 test.)
3. **A visit older than 12 h still attached to a room** → it is not an occupant; the room is not stuck purple. (Task 2 test on `roomOccupants`.)
4. **Capacity lowered below the number of people already in the room** → no crash; `hasFreeBedNow` false; promotion calls nobody. (Task 2 test.)
5. **Garbage / truncated / foreign `rac_display` cookie** → treated as unpaired (401 → new code), never a 500. (Task 7 test on `parseDisplayCookie` + `verifySecret` with wrong-length hash.)

---

### Task 1: Migration 0011

**Files:**
- Create: `supabase/migrations/0011_patient_flow.sql`

- [ ] **Step 1: Write the migration**, header comment in the style of 0008–0010, containing:
  - `rooms`: `capacity int not null default 1 check (capacity between 1 and 4)`, `turnover_started_at timestamptz` (both `add column if not exists`).
  - `checkins`: `practitioner_name text`, `room_id uuid references public.rooms(id) on delete set null`, `room_assigned_at`, `called_at`, `seen_at` (all `add column if not exists`).
  - `done_at` inside a `do $$ ... $$` block: only if the column is absent from `information_schema.columns`, add it and `update public.checkins set done_at = checked_in_at`.
  - `create index if not exists checkins_active_idx on public.checkins (checked_in_at) where done_at is null`.
  - `create table if not exists public.display_devices` with columns exactly as spec §1 (`id uuid pk default gen_random_uuid()`, `code text not null`, `secret_hash text not null`, `label text`, `created_at timestamptz not null default now()`, `created_ip text`, `approved_at`, `approved_by text`, `revoked_at`, `last_seen_at`), `enable row level security`, index on `(code)`.
- [ ] **Step 2: Commit** — `feat(flow): migration 0011 — visit flow columns, room capacity, display devices`

### Task 2: Pure flow logic

**Files:**
- Create: `src/lib/patient-flow.ts`, `src/lib/patient-flow.test.ts`

**Interfaces — Produces:**

```ts
export const VISIT_ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
export const CALL_DISPLAY_MS = 10 * 60 * 1000;

// The flow columns of a checkins row.
export interface FlowVisit {
  id: string;
  checked_in_at: string;
  practitioner_name: string | null;
  room_id: string | null;
  room_assigned_at: string | null;
  called_at: string | null;
  seen_at: string | null;
  done_at: string | null;
}
// What the board receives (no done_at: only active visits are sent).
export interface VisitView extends Omit<FlowVisit, "done_at"> {
  display_name: string;
  appointment_at: string | null;
}
export type VisitState = "waiting" | "next_up" | "called" | "treating";
export interface FlowRoom {
  id: string;
  capacity: number;
  timer_started_at: string | null;
  turnover_started_at: string | null;
}
export type VisitUpdate = { id: string; fields: Partial<FlowVisit> };

export function displayName(first: string | null | undefined, last: string | null | undefined): string;
export function isActiveVisit(v: Pick<FlowVisit, "checked_in_at" | "done_at">, nowMs: number): boolean;
export function visitState(v: Pick<FlowVisit, "room_id" | "called_at" | "seen_at">): VisitState;
// Generic so the board can call these with VisitView[].
type InRoom = Pick<FlowVisit, "id" | "room_id" | "room_assigned_at" | "called_at" | "seen_at">;
export function roomOccupants<T extends InRoom>(visits: T[], roomId: string): T[];   // called + treating
export function roomNextUp<T extends InRoom>(visits: T[], roomId: string): T[];      // oldest room_assigned_at first
export function hasFreeBedNow(room: FlowRoom, visits: InRoom[]): boolean;
export type AssignOutcome = "send" | "next_up" | "full";
export function assignOutcome(room: FlowRoom, visits: InRoom[]): AssignOutcome;
export function applyVisitUpdates<T extends { id: string }>(visits: T[], updates: { id: string; fields: Partial<T> }[]): T[];
export function assignUpdate(room: FlowRoom, visits: FlowVisit[], visitId: string, nowMs: number):
  { ok: true; updates: VisitUpdate[] } | { ok: false; error: string };
export function unassignUpdate(visitId: string): VisitUpdate;
export function removeUpdate(visitId: string, nowMs: number): VisitUpdate;
export function promotionUpdates(room: FlowRoom, visits: FlowVisit[], nowMs: number): VisitUpdate[];
export function timerFlowUpdates(action: TimerAction, roomAfter: FlowRoom, visits: FlowVisit[], nowMs: number): VisitUpdate[];
export function matchRosterDoctor(pbName: string | null, roster: { name: string }[]): string | null;
export function doctorForCalls(updates: VisitUpdate[], visits: FlowVisit[], roster: { name: string }[]): string | null;
```

Semantics the signatures don't pin:

- `visits` passed to room-level functions is the list of **active** visits (any room); each function filters by `room.id`. `visitState`: `room_id` null → `waiting` regardless of other timestamps.
- `displayName`: trim both; capitalise nothing; `"Alex", "Ryu"` → `"Alex R."`; no last name → `"Alex"`; no first name → `"Guest"`; last initial is the first letter uppercased.
- `hasFreeBedNow` (spec §2): `turnover_started_at === null` AND occupants < capacity AND next-up count is 0 AND (`timer_started_at === null` OR occupants ≥ 1).
- `assignOutcome`: free bed → `send`; else next-up count < capacity → `next_up`; else `full`. Evaluated with the visit being assigned **excluded** from `visits`.
- `assignUpdate`: excludes `visitId` from the room's lists first (re-assign to the same room is a no-op-safe move); `send` → `{ room_id, room_assigned_at: now, called_at: now, seen_at: null }`; `next_up` → same with `called_at: null`; `full` → `{ ok: false, error: "That room already has patients lined up" }`. Unknown `visitId` → `{ ok: false, error: "Visit not found" }`.
- `promotionUpdates`: if `timer_started_at === null` and `turnover_started_at === null`, call next-ups (`called_at: now`) oldest first while occupants < capacity. Otherwise `[]`.
- `timerFlowUpdates` (visits = state before the action; `roomAfter` = room with the timer fields already applied):
  - `start` → every `called` visit in the room gets `seen_at: now`.
  - `ready` → every occupant gets `done_at: now`, then `promotionUpdates` on the result.
  - `reset` → every occupant gets `seen_at: null`, then `promotionUpdates` on the result.
  - anything else → `[]`.
- `matchRosterDoctor`: tokenise by lowercasing and splitting on non-letters, dropping `dr`, `lac`, `dacm`, `daom` and empties; a roster entry matches when it has ≥ 1 token and all of its tokens are in the PB name's token set; exactly one matching entry → its `name`, else `null`.
- `doctorForCalls`: among updates that set a non-null `called_at`, take the last one whose visit's `practitioner_name` matches the roster; `null` if none.

- [ ] **Step 1: Write failing tests** (`patient-flow.test.ts`, same fixture style as `room-status.test.ts`: `T0`, `iso()`, a `visit()` factory, a `room()` factory). One `it` per line:
  - displayName: `("Alex","Ryu")→"Alex R."`, `(" alex ","ryu")→"alex R."`, `("Alex","")→"Alex"`, `("Alex",null)→"Alex"`, `(null,"Ryu")→"Guest"`.
  - isActiveVisit: done → false; 11 h 59 m old → true; 12 h 1 m old → false.
  - visitState: all four states; `room_id` null with `called_at` set → `waiting`.
  - roomOccupants ignores next-ups and other rooms; (Review Focus 3) a caller passing only active visits never sees a stale one — assert `visits.filter(isActiveVisit)` then `roomOccupants` is empty for a 13 h-old called visit.
  - hasFreeBedNow: empty idle room → true; idle room with 1 occupant, capacity 1 → false; hand-started timer, no occupants → false; capacity 2, timer running, 1 occupant → true (late partner); same but with a next-up present → false; turnover → false; (Review Focus 4) capacity 1 with 2 occupants → false.
  - assignOutcome: `send` / `next_up` / `full` (capacity 1 with 1 next-up → full; capacity 2 with 1 next-up on busy room → next_up).
  - assignUpdate: send sets `called_at`; next_up leaves it null; moving a visit already called in room A to idle room B → `send` with `room_id: B`, `seen_at: null`; unknown id → error.
  - promotionUpdates: idle free room with 2 next-ups, capacity 1 → only the older is called; capacity 2 → both; timer running → `[]`; turnover → `[]`; (Review Focus 4) over-capacity → `[]`.
  - timerFlowUpdates: start marks called as seen and leaves treating alone; ready marks occupants done and calls the next-up; reset nulls `seen_at`, promotes nothing when the bed is still taken, and promotes when the room had no occupants; `pause` → `[]`.
  - Promotion after unassign/remove: `applyVisitUpdates(visits, [removeUpdate(id, now)])` then filter active then `promotionUpdates` calls the next-up.
  - matchRosterDoctor: `"Alex Ryu"` vs `["Ryu"]`, `["Alex"]`, `["Dr. Alex Ryu, L.Ac."]` → match; vs `["Ryu","Alex Ryu"]` → `null` (ambiguous); vs `["Kim"]` → `null`; `null` name → `null`; roster entry `"Dr."` (no tokens) never matches.
  - doctorForCalls: picks the practitioner of the called visit; `null` when the update list has no call.
- [ ] **Step 2: Run** `npx vitest run src/lib/patient-flow.test.ts` — expect failures (module missing).
- [ ] **Step 3: Implement `patient-flow.ts`** to the interface above. Import `TimerAction` as a type from `./room-status`.
- [ ] **Step 4: Run** the same command — expect all pass.
- [ ] **Step 5: Commit** — `feat(flow): pure visit-flow logic with tests`

### Task 3: Room status — turnover, patient waiting, ready

**Files:**
- Modify: `src/lib/room-status.ts`, `src/lib/room-status.test.ts`

**Interfaces — Produces:**
- `RoomRow` gains `capacity: number` and `turnover_started_at: string | null`.
- `RoomStatus = "available" | "patient_waiting" | "turnover" | "in_use" | "complete" | "overtime"`.
- `deriveRoomState(room: RoomRow, nowMs: number, occupantCount = 0): RoomState` — order per spec §1 "Room status".
- `TimerAction` gains `"ready"`.
- `export const MAX_ROOM_CAPACITY = 4`.

`timerActionUpdate` changes:
- `start`: allowed only when no timer is running and `turnover_started_at` is null; otherwise `"Timer already running"` / `"Room is turning over"`.
- `clear`: only with a timer running (`"No session to clear"` otherwise); fields = the three timer nulls + `turnover_started_at: now`.
- `ready`: only when `turnover_started_at` is set and no timer (`"Room is not turning over"` otherwise); fields `{ turnover_started_at: null }`.
- `reset`: unchanged fields (three nulls); does not touch turnover.
- `adjust` / `set`: when no timer is running (available **or** turnover) they edit `default_duration_seconds`.

- [ ] **Step 1: Update `baseRoom` in the test file** with `capacity: 1, turnover_started_at: null`; add failing tests: `patient_waiting` when idle with `occupantCount` 1; `turnover` when `turnover_started_at` set (even with occupants); running timer wins over both; `clear` sets turnover; `clear` on an idle room errors; `ready` valid/invalid; `start` rejected in turnover; `adjust` in turnover edits the default. Update the existing `clear` expectations.
- [ ] **Step 2: Run** `npx vitest run src/lib/room-status.test.ts` — new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — all pass. Run `npx tsc --noEmit` — fix compile errors from the widened `RoomStatus` (`RoomTile` `STATUS_STYLES` gets placeholder entries `patient_waiting: { card: "bg-purple-700", label: "Patient waiting" }`, `turnover: { card: "bg-slate-600", label: "Turning over" }`).
- [ ] **Step 5: Commit** — `feat(rooms): turnover and patient-waiting statuses, ready action`

### Task 4: Server data layer, rooms GET, check-in, capacity

**Files:**
- Create: `src/lib/visits-server.ts`, `src/lib/visits-server.test.ts`
- Modify: `src/lib/rooms-realtime.ts`, `src/app/api/admin/rooms/route.ts`, `src/app/api/admin/rooms/[id]/route.ts`, `src/app/api/checkins/route.ts`, `src/components/confirmation-modal.tsx`

**Interfaces — Consumes:** Task 2 types. **Produces:**

```ts
// rooms-realtime.ts
export const FLOW_EVENT = "flow-updated";
export async function broadcastFlowUpdated(): Promise<void>;   // empty payload, swallows errors

// visits-server.ts
export interface VisitDbRow extends FlowVisit {
  appointment_at: string | null;
  patients: { first_name: string | null; last_name: string | null } | null;
}
export function toVisitView(row: VisitDbRow): VisitView;                       // pure
export async function loadActiveVisits(supabase: SupabaseClient, nowMs: number): Promise<VisitDbRow[]>;
export async function writeVisitUpdates(supabase: SupabaseClient, updates: VisitUpdate[]): Promise<boolean>;
```

- `loadActiveVisits`: `checkins` select of the flow columns + `appointment_at` + `patients(first_name, last_name)`, `done_at is null`, `checked_in_at >= now − 12 h`, ordered by `checked_in_at`. Throws on DB error.
- `writeVisitUpdates`: one `update … eq id` per entry; returns false if any failed (never throws).
- `GET /api/admin/rooms`: adds `visits: VisitView[]`. If `loadActiveVisits` throws, respond with `visits: []` rather than 500 — the timer board must keep working.
- `PATCH /api/admin/rooms/[id]`: accept `capacity` (int 1–`MAX_ROOM_CAPACITY`) → `capacity`.
- `POST /api/checkins`: insert also `practitioner_name: session.practitioner`; after a successful insert `await broadcastFlowUpdated()` inside its own try/catch.
- `confirmation-modal.tsx` non-duplicate success copy: `Thank you, {firstName}!` then `You're checked in. Please have a seat — your name and room will appear on the screen.` (the second sentence in a smaller text size than the 4xl headline so it fits the kiosk without scrolling).

- [ ] **Step 1: Failing test** `visits-server.test.ts` for `toVisitView`: maps names through `displayName`; (Review Focus 1) null `patients`, null `appointment_at`, null `practitioner_name` → `display_name: "Guest"`, nulls preserved; output has no `done_at` and no `patients` key.
- [ ] **Step 2: Run** `npx vitest run src/lib/visits-server.test.ts` — fails.
- [ ] **Step 3: Implement** the lib and route changes above.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** — `feat(flow): visits on the rooms API, practitioner snapshot at check-in, room capacity`

### Task 5: Visit actions and timer integration

**Files:**
- Create: `src/lib/flow-server.ts`, `src/app/api/admin/visits/[id]/route.ts`
- Modify: `src/app/api/admin/rooms/[id]/timer/route.ts`

**Interfaces — Produces:**

```ts
// flow-server.ts — the one place that applies a flow change end to end.
// Writes visit updates, sets the room's doctor pill if a call matched the
// roster, broadcasts changed room rows + one flow hint.
export async function commitFlow(
  supabase: SupabaseClient,
  args: { updates: VisitUpdate[]; visitsBefore: VisitDbRow[]; roomId: string | null; nowMs: number }
): Promise<{ visits: VisitView[]; rooms: RoomRow[] }>;
```

- `commitFlow`: `writeVisitUpdates`; if `roomId` and `doctorForCalls(...)` returns a name different from the room's current `doctor_name`, update the room (`doctor_name`, `updated_at`) and `broadcastRoomsUpdated({ room })`; then `broadcastFlowUpdated()`; reload and return active visits as views plus any room rows it changed. Roster = `doctors` table.
- `POST /api/admin/visits/[id]`, body `z.discriminatedUnion("action", [{action:"assign", roomId: uuid}, {action:"unassign"}, {action:"remove"}])`:
  1. load active visits; visit not among them → 404 `"Visit not found"`.
  2. `assign`: load target room (404 if missing); `assignUpdate` (409 on `ok:false`); if the visit was in a different room, also run `promotionUpdates` for that old room on the post-update list and commit both (old room's doctor pill handled by a second `commitFlow` call with empty updates is not needed — call `commitFlow` once per affected room with that room's updates).
  3. `unassign` / `remove`: apply, then `promotionUpdates` for the room it left (if any).
  4. respond `{ visits, rooms }`.
- Timer route: accept `"ready"` in the zod enum. After the room write succeeds, for `start`, `ready`, `reset`: load active visits, `timerFlowUpdates(action, room, visits, now)`, `commitFlow`. Wrap the whole flow part in try/catch — on failure still return `{ room }`. Response: `{ room, visits? }` where `room` is the latest row (after a doctor-pill change, the row `commitFlow` returned).

- [ ] **Step 1: Implement** `flow-server.ts` and both routes.
- [ ] **Step 2: Verify** `npm test && npx tsc --noEmit && npm run lint` — pass.
- [ ] **Step 3: Commit** — `feat(flow): visit assign/unassign/remove API; timer actions drive visit state`

(No route-level unit tests: the repo has none for routes and no Supabase test double; the decisions live in the Task 2 pure functions, which are tested. End-to-end behavior is exercised in Task 9.)

### Task 6: Staff board UI

**Files:**
- Create: `src/app/admin/rooms/WaitingList.tsx`
- Modify: `src/app/admin/rooms/useRooms.ts`, `useAlarm.ts`, `RoomTile.tsx`, `page.tsx`, `LayoutEditor.tsx`

**Interfaces — Consumes:** `VisitView`, `roomOccupants`, `roomNextUp`, `assignOutcome`, `CALL_DISPLAY_MS`; API shapes from Tasks 4–5.

- `useRooms`: holds `visits: VisitView[]` (set from every `GET` and from any mutation response that includes `visits`; upsert any `rooms` array in a response). Subscribes to `FLOW_EVENT` on the same channel → `refresh()`. New `visitAction(visitId, action: "assign" | "unassign" | "remove", roomId?)`. `updateRoom` input gains `capacity?`. Optimistic timer patches keep working; no optimistic visit changes. Exposes `visits`.
- `page.tsx`: `selectedVisitId` state. Renders `<WaitingList>` above the grid in live view. Passes each tile its `occupants`, `nextUp`, `assignMode` (`AssignOutcome | null`, computed with `assignOutcome` on the visits minus the selected one), `onAssignHere`, `onVisitAction`. `deriveRoomState(room, serverNowMs, occupants.length)`. A `pointerdown` outside chips/tiles clears the selection.
- `WaitingList`: props `{ visits: VisitView[]; doctors: DoctorRow[]; nowMs: number; selectedId: string | null; onSelect(id | null); onRemove(id) }`. Chips for `visitState === "waiting"`, oldest first: `display_name`, appointment time (`toLocaleTimeString` in `America/Los_Angeles`, omitted when null), doctor (roster color dot via `matchRosterDoctor` + `doctorColorClasses`, plain text otherwise, omitted when null), "12 min". `×` asks for a second tap ("Remove?") before calling `onRemove`. Empty: muted "No one waiting". New chips animate in with GSAP (`ease: "house"`, as in `RoomTile`).
- `RoomTile`: occupant names under the pill joined by " · " (a called-but-unseen occupant whose `called_at` is within `CALL_DISPLAY_MS` gets a pulsing dot); "Next: A · B" line; tapping a name opens a small in-tile menu (same overlay pattern as the doctor list) with "Back to waiting list" / "Remove". `patient_waiting`: label "Patient waiting", plus `waiting m:ss` since the oldest unseen `called_at`. `turnover`: timer controls replaced by one large "Room ready" button → `onAction("ready")`. In `assignMode`: full-tile overlay button "Send here" / "Next up here" / disabled "Full".
- `useAlarm(rooms, serverNowMs, visits, occupantCountFor)`: needle alarm unchanged (must use the occupant-aware status only for `complete`/`overtime`, which don't depend on occupants). Add a one-shot rising chime (659.25 Hz → 880 Hz, same envelope as `playChime`) whenever a visit id appears with `called_at` set that was not called on the previous render; never on the first data load.
- `LayoutEditor`: "Beds" number stepper (1–4) in the room edit sheet next to "Default minutes", saved through `onUpdate(room.id, { capacity })`.

- [ ] **Step 1: Implement** the hook changes, then `WaitingList`, then `RoomTile`, `page.tsx`, `useAlarm`, `LayoutEditor`.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint && npm test`.
- [ ] **Step 3: Commit** — `feat(rooms): waiting list, room assignment, patient-waiting and turnover tiles`

### Task 7: Display pairing backend

**Files:**
- Create: `src/lib/display-auth.ts`, `src/lib/display-auth.test.ts`, `src/lib/display-server.ts`, `src/app/api/display/pair/route.ts`, `src/app/api/display/calls/route.ts`, `src/app/api/admin/displays/route.ts`, `src/app/api/admin/displays/approve/route.ts`, `src/app/api/admin/displays/[id]/route.ts`

**Interfaces — Produces:**

```ts
// display-auth.ts (pure, node:crypto only)
export const DISPLAY_COOKIE = "rac_display";
export const DISPLAY_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
export const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
export const PENDING_TTL_MS = 10 * 60 * 1000;
export const PAIR_MAX_PER_HOUR = 10;
export function generatePairCode(): string;                 // crypto.randomInt per char
export function generateSecret(): string;                   // 32 random bytes, base64url
export function hashSecret(secret: string): string;         // sha256 hex
export function verifySecret(secret: string, hash: string): boolean;   // timingSafeEqual; false on length mismatch
export function parseDisplayCookie(value: string | undefined | null): { id: string; secret: string } | null;
export function formatDisplayCookie(id: string, secret: string): string;  // `${id}.${secret}`
export function normalizePairCode(input: string): string;   // uppercase, strip spaces/dashes
export function isApprovable(row: { approved_at: string | null; revoked_at: string | null; created_at: string }, nowMs: number): boolean;

// display-server.ts
export type DisplayAuth = { status: "ok" } | { status: "pending"; code: string } | { status: "none" };
export async function authorizeDisplay(supabase: SupabaseClient, cookieValue: string | undefined, nowMs: number): Promise<DisplayAuth>;
```

- `parseDisplayCookie`: id must be a UUID, secret must match `/^[A-Za-z0-9_-]{43}$/`; anything else → `null`.
- `authorizeDisplay`: bad cookie / unknown id / hash mismatch / revoked / pending older than `PENDING_TTL_MS` → `none`; pending → `pending` with its code; approved → `ok` and bump `last_seen_at` if older than 60 s.
- `POST /api/display/pair` (public): if the caller already has a cookie that authorises as `ok` or `pending`, return that state instead of creating a row. Otherwise: per-IP count of `display_devices` rows created in the last hour ≥ 10 → 429 (DB error → 429, fail closed); delete pending rows older than 24 h; insert; set cookie (`httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, max-age above); respond `{ code }`.
- `GET /api/display/calls`: authorised when `isAdminAuthorized()` **or** `authorizeDisplay` is `ok`. `none` → 401 `{ pair: true }`; `pending` → 403 `{ pending: true, code }`. Success → `{ calls: [{ id, displayName, roomName, calledAt }], serverTime }`: active visits with `room_id` set, `called_at` set, `seen_at` null, `called_at` within `CALL_DISPLAY_MS`, joined to the room name, newest call first. `Cache-Control: no-store`. When authorised by cookie, re-set the cookie to slide its expiry.
- Staff routes: `GET /api/admin/displays` → `{ displays: [{ id, label, approvedAt, lastSeenAt }] }` (approved, not revoked). `POST …/approve` `{ code, label? (≤ 40) }` → finds the newest row with that normalised code where `isApprovable`; none → 404 `"Code not found or expired"`; sets `approved_at`, `approved_by` (session email), `label` (default "Waiting room screen"). `DELETE …/[id]` → sets `revoked_at`.

- [ ] **Step 1: Failing tests** `display-auth.test.ts`: code is 6 chars all in the alphabet (run 200×); `normalizePairCode(" k7m-4qx ") === "K7M4QX"`; hash/verify round trip; wrong secret → false; (Review Focus 5) `verifySecret("x", "short")` → false without throwing; `parseDisplayCookie` round-trips `formatDisplayCookie`, and returns null for `undefined`, `""`, `"abc"`, `"not-a-uuid.secret"`, a valid id with a 10-char secret, and a value with two dots; `isApprovable`: fresh pending → true, 11 min old → false, approved → false, revoked → false.
- [ ] **Step 2: Run** `npx vitest run src/lib/display-auth.test.ts` — fails.
- [ ] **Step 3: Implement** lib + routes.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npm run lint` — pass.
- [ ] **Step 5: Commit** — `feat(display): device-code pairing and calls API for the waiting-room screen`

### Task 8: Waiting-room screen and dashboard Screens panel

**Files:**
- Create: `src/app/waiting-room/layout.tsx` (metadata: `robots: { index: false, follow: false }`, title "Waiting Room"), `src/app/waiting-room/page.tsx`, `src/app/waiting-room/WaitingRoomScreen.tsx`, `src/app/admin/dashboard/ScreensPanel.tsx`
- Modify: `src/components/conditional-header.tsx`, `src/components/conditional-footer.tsx` (also hide on `/waiting-room`), `src/app/admin/dashboard/page.tsx` (render `<ScreensPanel />`; it carries the link to `/waiting-room`), `next.config.js` only if the CSP blocks something the screen needs.

- `WaitingRoomScreen` (client) state machine: `loading` → GET calls → `200` → `live`; `401` → POST pair → `pairing(code)`; `403` → `pairing(code)`; `429` or network error → `error` ("This screen can't connect right now"), retry every 30 s. In `pairing`, poll calls every 5 s; an expired code (401) silently re-pairs. In `live`, poll every 10 s plus refetch on `ROOMS_EVENT`/`FLOW_EVENT` broadcasts (guarded subscribe, as in `useRooms`), `online`, `visibilitychange`; a 401 drops back to pairing. Clock skew from `serverTime`; a 1 s tick drops calls older than `CALL_DISPLAY_MS` locally. Failed poll in `live` → keep the list, show a small "Reconnecting…" mark.
- Layout: `h-dvh` dark (`bg-neutral-950`), no scroll. Heading "Your room is ready" only when there are calls. Each call one row, `font-serif`, name left, `→ Room 3` right, sized with `clamp()` so 4 rows fill a 1080p screen; more than 6 calls → shrink, never scroll. New rows animate in (GSAP `house` ease) with a ~4 s highlight sweep. Empty state copy exactly: "Please have a seat." / "Your name will appear here when your room is ready." Pairing state: "Staff: enter this code in Dashboard → Screens" with the code in very large spaced type.
- Sound: chime (reuse the needle chime's two-tone, descending is fine here — different device) on each new call id after the first load. `AudioContext` is created on the first `keydown`/`pointerdown`; until then a corner hint "Press OK to turn on sound". Wake lock requested as in `useAlarm`.
- `ScreensPanel` (client): code input (auto-uppercase, 6 chars) + optional label + "Pair screen" → `POST /api/admin/displays/approve`; list of paired screens with label, paired date, last seen ("just now" / "5 min ago" / date) and "Revoke" (second-tap confirm); a line "Only enter a code shown on the clinic's own screen."; link "Open waiting-room screen" → `/waiting-room`. Styled like the neighbouring dashboard sections.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- [ ] **Step 3: Commit** — `feat(display): waiting-room screen and dashboard pairing panel`

### Task 9: Docs and end-to-end verification

**Files:**
- Modify: `CLAUDE.md` (route list, `checkins`/`rooms`/`display_devices` schema, broadcast rule, migration 0011 note, kiosk copy), `docs/superpowers/specs/2026-11-19-patient-room-flow-design.md` (status → Approved; note any deviation made while building)

- [ ] **Step 1: Update docs.**
- [ ] **Step 2: Full check** `npm test && npm run lint && npm run build` — all pass.
- [ ] **Step 3: Drive it if a database is reachable locally** (needs Supabase env vars and migration 0011 applied; see the project memory on minted NextAuth cookies + Playwright WebKit). Walk spec §10 manual QA. If no database is reachable from this machine, say so plainly in the hand-off and list the QA steps for Alex instead.
- [ ] **Step 4: Commit** — `docs: patient room flow — CLAUDE.md and spec status`
