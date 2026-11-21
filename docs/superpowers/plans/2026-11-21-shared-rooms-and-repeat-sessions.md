# Shared Rooms and Repeat Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-bed room is private to one group (staff say who is together), a second group can wait in line for it, and a doctor can start another timed session for the people already in the room.

**Architecture:** All rules stay in the pure modules `src/lib/patient-flow.ts` and `src/lib/room-status.ts`; the board and the server call the same functions. The assign request gains `togetherWith` (the visit ids staff said yes to); the timer gains one action, `again`. No schema change.

**Tech Stack:** Next.js App Router, TypeScript, React, zod, vitest (`npm test`), @dnd-kit (already in use), Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-21-shared-rooms-and-repeat-sessions-design.md` — read it first; it builds on `docs/superpowers/specs/2026-11-19-patient-room-flow-design.md`. Project rules: `CLAUDE.md`.

## Global Constraints

- **Privacy fails closed:** no code path may give a patient `called_at` in a room that has an occupant unless the request's `togetherWith` equals that room's current occupant ids. When in doubt: line up or refuse.
- No database migration. No new dependency.
- Code identifiers keep their names: status `turnover`, column `turnover_started_at`. Only staff-visible text changes to "Setting Up".
- `start` during Setting Up keeps its existing meaning ("Room ready + Start"). Do not change it.
- Patient data never goes on a Realtime broadcast (unchanged; do not add payloads).
- Dragging stays MouseSensor-only; iPads use tap-then-tap.
- Exact staff-visible strings:
  - tile label: `Setting Up`
  - buttons: `Another session`, `Room ready`, `Yes, send in`, `No, next up`, `Yes, line up together`, `Cancel`
  - 409s: `{room} already has someone waiting for it`, `{room} changed — please choose again`, `That room already has patients lined up` (unchanged), `Room is not setting up`
- Every task ends green on `npm test`, `npx tsc --noEmit` and `npm run lint`.
- Work on a new branch `shared-rooms-repeat-sessions` cut from `origin/main` (PR #50 is merged; do not continue on `rooms-drag-to-room`). Commit per task; do not push.

## Review Focus

Conditions the spec implies that are most likely to bite staff, each pinned by a test in the task named:

1. A "Yes" tapped after the room emptied (the partner was finished meanwhile) must be refused, not send the patient in alone under a stale question — Task 1, `assignUpdate` "room emptied".
2. A "Yes" naming only one of two occupants (a third person joined) must be refused — Task 1, "partial match".
3. A board that was never reloaded sends no `togetherWith` to an occupied shared room: the patient is lined up — Task 1, "absent".
4. The room in an open question is deleted, or the patient is taken by another board: the question closes — Task 2, `joinQuestionOpen`.
5. "Another session" while a group is lined up: the line stays a line and is still called by the later "Room ready" — Task 3, `timerFlowUpdates("again")` then `("ready")`.

---

### Task 1: Who may enter a room (rules + server)

**Files:**
- Modify: `src/lib/patient-flow.ts` (the block from `hasFreeBedNow` through `assignUpdate`, and `promotionUpdates`)
- Modify: `src/lib/patient-flow.test.ts` (`hasFreeBedNow`, `assignOutcome`, `assignUpdate`, `promotionUpdates` blocks)
- Modify: `src/app/api/admin/visits/[id]/route.ts`
- Modify: `src/app/admin/rooms/RoomTile.tsx` (`ASSIGN_LABELS` only), `src/app/admin/rooms/WaitingList.tsx` (`DROP_LABELS` only) — both are `Record<AssignOutcome, …>` and stop compiling otherwise
- Modify: `CLAUDE.md`

**Interfaces — produces:**

```ts
export interface FlowRoom { id: string; name?: string; capacity: number;
  timer_started_at: string | null; turnover_started_at: string | null }
export type AssignOutcome =
  "send" | "next_up" | "ask_join_room" | "ask_join_line" | "full";
export function assignOutcome(room: FlowRoom, visits: InRoom[]): AssignOutcome;
// Who a "Together with …?" question is about: the occupants for
// ask_join_room, the line (oldest first) for ask_join_line, else [].
export function assignCompanions<T extends InRoom>(room: FlowRoom, visits: T[]): T[];
export function assignUpdate(room: FlowRoom, visits: FlowVisit[], visitId: string,
  nowMs: number, togetherWith?: string[]
): { ok: true; updates: VisitUpdate[] } | { ok: false; error: string };
```

`hasFreeBedNow` is deleted (its only caller was `assignOutcome`).

- [ ] **Step 1: Branch**

```bash
git fetch origin && git checkout -b shared-rooms-repeat-sessions origin/main
```
The untracked spec and this plan come along. Expected: `git status` shows only those two files untracked.

- [ ] **Step 2: Write the failing tests** in `src/lib/patient-flow.test.ts`

Remove the `hasFreeBedNow` import and its `describe`. Add `AssignOutcome` and `assignCompanions` to the import. Add helpers next to `timerRunning`:

```ts
const settingUp = { turnover_started_at: iso(T0 - MIN) };
const two = (o: Partial<FlowRoom> = {}) => room({ capacity: 2, ...o });
const named = (o: Partial<FlowRoom> = {}) => room({ name: "Room 5", ...o });
const fieldsOf = (r: ReturnType<typeof assignUpdate>) =>
  r.ok ? r.updates[0].fields : r;
```

Replace `describe("assignOutcome")` with:

```ts
describe("assignOutcome", () => {
  it.each<[string, FlowRoom, FlowVisit[], AssignOutcome]>([
    // one bed — exactly as before
    ["empty one-bed room", room(), [], "send"],
    ["one-bed room, patient waiting for the doctor", room(), [called("a")], "next_up"],
    ["one-bed room mid-treatment", room(timerRunning), [treating("a")], "next_up"],
    ["one-bed room with a line", room(timerRunning), [treating("a"), nextUp("n")], "full"],
    ["hand-started timer, nobody tracked", room(timerRunning), [], "next_up"],
    ["one-bed room setting up", room(settingUp), [], "next_up"],
    ["over-full one-bed room", room(), [called("a"), called("b")], "next_up"],
    ["people in other rooms do not count", room(), [called("a", "r2")], "send"],
    // two beds
    ["empty two-bed room", two(), [], "send"],
    ["two beds, one patient waiting for the doctor", two(), [called("a")], "ask_join_room"],
    ["two beds, one patient mid-treatment", two(timerRunning), [treating("a")], "ask_join_room"],
    ["two beds, both taken", two(timerRunning), [treating("a"), treating("b")], "next_up"],
    ["two beds, hand-started timer, nobody tracked", two(timerRunning), [], "next_up"],
    ["two beds setting up, spare bed, no line", two(settingUp), [treating("a")], "next_up"],
    ["two beds, one in line", two(timerRunning), [treating("a"), nextUp("n")], "ask_join_line"],
    ["a line wins over setting up", two(settingUp), [treating("a"), nextUp("n")], "ask_join_line"],
    ["a line wins over an empty room", two(), [nextUp("n")], "ask_join_line"],
    ["two beds, line of two", two(timerRunning), [treating("a"), nextUp("n"), nextUp("m")], "full"],
  ])("%s", (_name, r, visits, expected) => {
    expect(assignOutcome(r, visits)).toBe(expected);
  });
});

describe("assignCompanions", () => {
  it("is the occupants when the question is about the room", () => {
    const visits = [treating("a"), called("b", "r2")];
    expect(assignCompanions(two(timerRunning), visits).map((v) => v.id)).toEqual(["a"]);
  });
  it("is the line, oldest first, when the question is about the line", () => {
    const r = room({ capacity: 3, ...timerRunning });
    const visits = [treating("a"), nextUp("late", T0 - MIN), nextUp("early", T0 - 9 * MIN)];
    expect(assignCompanions(r, visits).map((v) => v.id)).toEqual(["early", "late"]);
  });
  it("is nobody when there is nothing to ask", () => {
    expect(assignCompanions(two(), [])).toEqual([]);
    expect(assignCompanions(room(), [called("a")])).toEqual([]);
  });
});
```

Keep the six existing `assignUpdate` tests unchanged and add inside the same `describe`:

```ts
  const lined = { room_id: "r1", room_assigned_at: iso(T0), called_at: null, seen_at: null };
  const sent = { ...lined, called_at: iso(T0) };
  const CHANGED = { ok: false, error: "Room 5 changed — please choose again" };

  it("absent: an occupied shared room lines the patient up", () => {
    const visits = [called("x"), waiting("a")];
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0))).toEqual(lined);
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0, []))).toEqual(lined);
  });
  it("a yes naming the occupants sends the patient in", () => {
    const visits = [called("x"), waiting("a")];
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0, ["x"]))).toEqual(sent);
  });
  it("a yes names every occupant, in any order", () => {
    const r = room({ capacity: 3 });
    const visits = [called("x"), called("y"), waiting("a")];
    expect(fieldsOf(assignUpdate(r, visits, "a", T0, ["y", "x"]))).toEqual(sent);
  });
  it("partial match: a yes naming one of two occupants is refused", () => {
    const r = named({ capacity: 3 });
    const visits = [called("x"), called("y"), waiting("a")];
    expect(assignUpdate(r, visits, "a", T0, ["x"])).toEqual(CHANGED);
  });
  it("a yes naming the line joins the line", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(fieldsOf(assignUpdate(two(timerRunning), visits, "a", T0, ["n"]))).toEqual(lined);
  });
  it("no answer on a room with a line is refused, by name", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(assignUpdate(named({ capacity: 2, ...timerRunning }), visits, "a", T0)).toEqual({
      ok: false,
      error: "Room 5 already has someone waiting for it",
    });
    expect(assignUpdate(two(timerRunning), visits, "a", T0)).toEqual({
      ok: false,
      error: "That room already has someone waiting for it",
    });
  });
  it.each<[string, FlowRoom, FlowVisit[], string[]]>([
    ["a line appeared behind the room", named({ capacity: 2 }), [called("x"), nextUp("n")], ["x"]],
    ["the line it named is gone", named({ capacity: 2 }), [called("x")], ["n"]],
    ["the occupant was replaced", named({ capacity: 2 }), [called("y")], ["x"]],
    ["room emptied", named({ capacity: 2 }), [], ["x"]],
    ["the room filled up", named({ capacity: 2, ...timerRunning }), [treating("x"), treating("y")], ["x"]],
    ["it names someone in another room", named({ capacity: 2 }), [called("x"), called("z", "r2")], ["z"]],
  ])("a stale yes is refused: %s", (_name, r, others, togetherWith) => {
    const visits = [...others, waiting("a")];
    expect(assignUpdate(r, visits, "a", T0, togetherWith)).toEqual(CHANGED);
  });
```

In `describe("promotionUpdates")`: rename "fills both beds of a two-bed room" to "calls the whole line of an empty two-bed room, oldest first" (body unchanged) and add:

```ts
  it("calls nobody while anyone is still in a shared room", () => {
    expect(promotionUpdates(two(), [treating("x"), nextUp("a")], T0)).toEqual([]);
  });
  it("calls a waiting couple together once the last occupant has left", () => {
    const before = [treating("x"), treating("y"), nextUp("a", T0 - 9 * MIN), nextUp("b", T0 - MIN)];
    const oneLeft = applyVisitUpdates(before, [removeUpdate("x", T0)]).filter((v) => v.done_at === null);
    expect(promotionUpdates(two(), oneLeft, T0)).toEqual([]);
    const empty = applyVisitUpdates(oneLeft, [removeUpdate("y", T0)]).filter((v) => v.done_at === null);
    expect(promotionUpdates(two(), empty, T0).map((u) => u.id)).toEqual(["a", "b"]);
  });
```

- [ ] **Step 3: Run to see them fail**

Run: `npm test -- src/lib/patient-flow.test.ts`
Expected: FAIL (missing export `assignCompanions`, outcomes `ask_join_room` / `ask_join_line`).

- [ ] **Step 4: Implement in `src/lib/patient-flow.ts`**

- `FlowRoom` gains `name?: string`.
- `assignOutcome`: the spec's seven-row table, first match wins, in that order.
- `assignCompanions`: per the Interfaces comment.
- `assignUpdate(…, togetherWith = [])`: the spec's "staff answer" table. "Same ids" = set equality between `togetherWith` and the ids of `assignCompanions(room, others)`. Room name in messages is `room.name ?? "That room"`.
- `promotionUpdates`: return `[]` unless the room has no timer, is not setting up, and `roomOccupants(...)` is empty; then call `roomNextUp(...).slice(0, room.capacity)`.
- Delete `hasFreeBedNow`. Rewrite the file's header comment and the comment above `promotionUpdates` to describe one group per room and "calls the line only when the room is empty".

- [ ] **Step 5: Server and label maps**

- `src/app/api/admin/visits/[id]/route.ts`: the `assign` variant of `bodySchema` gains `togetherWith: z.array(z.string().uuid()).max(MAX_ROOM_CAPACITY).optional()` (`MAX_ROOM_CAPACITY` from `@/lib/room-status`); pass `input.togetherWith` as the fifth argument of `assignUpdate`. Update the route's header comment (assign: "together with named people, or lined up").
- `RoomTile.tsx` `ASSIGN_LABELS`: add `ask_join_room: "Together or next up…"`, `ask_join_line: "Join the line…"`.
- `WaitingList.tsx` `DROP_LABELS`: add ``ask_join_room: (roomName) => `${roomName}: together or next up?` ``, ``ask_join_line: (roomName) => `${roomName}: join the line?` ``.

(Until Task 2 the board sends no `togetherWith`, so tapping such a tile lines the patient up or is refused — the safe side.)

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all pass, no type errors.

- [ ] **Step 7: CLAUDE.md, "Patient room flow"**

- Replace the bullet starting "STAFF choose the room" with: staff choose the room; a room holds ONE GROUP at a time (people share a room only when staff say they are together); an empty room → called now; an occupied room with a spare bed → the board asks "Together with …?" (yes = called now, no = next up); a room with a line → only "join the line"; the answer travels as `togetherWith` (visit ids) and the server refuses it if those people are no longer the room's occupants / line; absent = not together.
- Replace the "Promotion is a rule" bullet's condition with: an idle room (no timer, not setting up) with NO occupants calls its whole line, oldest first.
- Route list, `/api/admin/visits/[id]`: `assign(roomId, togetherWith?)`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/patient-flow.ts src/lib/patient-flow.test.ts "src/app/api/admin/visits/[id]/route.ts" src/app/admin/rooms/RoomTile.tsx src/app/admin/rooms/WaitingList.tsx CLAUDE.md docs/superpowers/specs/2026-11-21-shared-rooms-and-repeat-sessions-design.md docs/superpowers/plans/2026-11-21-shared-rooms-and-repeat-sessions.md
git commit -m "feat(rooms): one group per room — shared rooms ask who is together"
```

---

### Task 2: The "Together with …?" question on the board

**Files:**
- Modify: `src/lib/patient-flow.ts`, `src/lib/patient-flow.test.ts`
- Modify: `src/app/admin/rooms/useRooms.ts` (`visitAction`)
- Modify: `src/app/admin/rooms/page.tsx`, `src/app/admin/rooms/RoomTile.tsx`

**Interfaces:**
- Consumes (Task 1): `assignOutcome`, `assignCompanions`, `AssignOutcome`.
- Produces:

```ts
// patient-flow.ts
export interface JoinQuestion {
  visitId: string; roomId: string;
  kind: "ask_join_room" | "ask_join_line";
  companionIds: string[];
}
// The question that assigning this visit to this room raises right now,
// or null when the outcome is not an "ask" one. The visit itself is
// left out of the room's lists.
export function joinQuestionFor(room: FlowRoom, visits: InRoom[], visitId: string): JoinQuestion | null;
// False as soon as anything the open question rests on has changed.
export function joinQuestionOpen(q: JoinQuestion, rooms: FlowRoom[], visits: InRoom[]): boolean;

// useRooms.ts
visitAction(visitId: string, action: VisitAction, roomId?: string, togetherWith?: string[]): Promise<void>;

// RoomTile.tsx — new props
question: { patientName: string; companionNames: string[];
            kind: "ask_join_room" | "ask_join_line" } | null;
onAnswer: (together: boolean) => void;
onCancelQuestion: () => void;
```

- [ ] **Step 1: Write the failing tests** (`patient-flow.test.ts`, new `describe("join question")`)

```ts
describe("join question", () => {
  const rooms = [two({ id: "r1" })];
  it("asks about the occupants of a shared room with a spare bed", () => {
    expect(joinQuestionFor(two(), [called("x"), waiting("a")], "a")).toEqual({
      visitId: "a", roomId: "r1", kind: "ask_join_room", companionIds: ["x"],
    });
  });
  it("asks about the line when the room has one", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(joinQuestionFor(two(timerRunning), visits, "a")).toMatchObject({
      kind: "ask_join_line", companionIds: ["n"],
    });
  });
  it("is null when there is nothing to ask", () => {
    expect(joinQuestionFor(two(), [waiting("a")], "a")).toBeNull();
    expect(joinQuestionFor(room(), [called("x"), waiting("a")], "a")).toBeNull();
  });
  it("stays open while nothing changed", () => {
    const visits = [called("x"), waiting("a")];
    const q = joinQuestionFor(rooms[0], visits, "a")!;
    expect(joinQuestionOpen(q, rooms, visits)).toBe(true);
  });
  it.each<[string, FlowRoom[], FlowVisit[]]>([
    ["the occupant was replaced", rooms, [called("y"), waiting("a")]],
    ["a second occupant joined", [room({ capacity: 3 })], [called("x"), called("y"), waiting("a")]],
    ["a line appeared", rooms, [called("x"), nextUp("n"), waiting("a")]],
    ["the room emptied", rooms, [waiting("a")]],
    ["the room was deleted", [], [called("x"), waiting("a")]],
    ["the patient got a room elsewhere", rooms, [called("x"), called("a", "r2")]],
    ["the patient left the board", rooms, [called("x")]],
  ])("closes when %s", (_name, roomsNow, visitsNow) => {
    const q = joinQuestionFor(rooms[0], [called("x"), waiting("a")], "a")!;
    expect(joinQuestionOpen(q, roomsNow, visitsNow)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/lib/patient-flow.test.ts` — Expected: FAIL (`joinQuestionFor` not exported).

- [ ] **Step 3: Implement `joinQuestionFor` and `joinQuestionOpen`**

`joinQuestionOpen` is: the visit is in `visits` with `room_id === null`, the room is in `rooms`, and `joinQuestionFor(room, visits, q.visitId)` has the same `kind` and the same set of `companionIds`.

- [ ] **Step 4: Run** — `npm test -- src/lib/patient-flow.test.ts` — Expected: PASS.

- [ ] **Step 5: `useRooms.visitAction`**

Add the fourth parameter; the POST body for `assign` is `{ action, roomId, togetherWith }` with `togetherWith` omitted when empty or undefined.

- [ ] **Step 6: `page.tsx` — owning the question**

- State: `const [question, setQuestion] = useState<JoinQuestion | null>(null)`.
- Derive every render: `openQuestion = question && question.visitId === selectedVisitId && joinQuestionOpen(question, rooms, visits) ? question : null`. Render from `openQuestion`, never from `question`, so a stale question is gone in the same frame; an effect sets `question` back to null when `question && !openQuestion`.
- One function used by both the tile tap (`onAssignHere`) and `onDragEnd`: compute `joinQuestionFor(room, visits, visit.id)`. If non-null → `setQuestion(it)` and keep `selectedVisitId = visit.id` (after a drop, `endDrag()` clears the selection first — set it again). If null → today's behaviour (`full` does nothing; otherwise clear the selection and `visitAction(visit.id, "assign", room.id)`).
- `onAnswer(together)`: clear question and selection, then `visitAction(q.visitId, "assign", q.roomId, together ? q.companionIds : undefined)`.
- `onCancelQuestion`: clear question and selection.
- The existing outside-tap effect clears the selection on any pointerdown outside `[data-assign-keep]`; that also closes the question (it is tied to the selection). The panel root must carry `data-assign-keep`.
- Pass `question` to the one matching `RoomTile` (names from `visits` by id: `patientName` = the selected visit's `display_name`, `companionNames` = the companions' `display_name`s in `companionIds` order); `null` to the others.

- [ ] **Step 7: `RoomTile.tsx` — the panel**

When `question` is set, render the panel instead of the `assignMode` overlay (same `absolute inset-0 z-20 rounded-2xl bg-neutral-900/95` family as the patient menu, `data-assign-keep` on its root). Content, top to bottom:

- `{patientName} → {room.name}`
- `Together with {names}?` where names = `companionNames.join(" & ")`, followed by ` (next up)` for `ask_join_line`
- `ask_join_room`: buttons `Yes, send in` → `onAnswer(true)`, `No, next up` → `onAnswer(false)`
- `ask_join_line`: button `Yes, line up together` → `onAnswer(true)`, then one line of text: `{room.name} already has someone waiting for it.`
- `Cancel` → `onCancelQuestion()`

Buttons are disabled while `busy`. They must be full-width finger targets like the patient menu's (`w-full rounded-lg px-2 py-1.5 text-sm`), and the panel must fit the tile at the board's iPad size without scrolling (names truncate).

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint` — Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/patient-flow.ts src/lib/patient-flow.test.ts src/app/admin/rooms
git commit -m "feat(rooms): ask \"Together with …?\" before sharing a room"
```

---

### Task 3: Another session, and "Setting Up"

**Files:**
- Modify: `src/lib/room-status.ts`, `src/lib/room-status.test.ts`
- Modify: `src/lib/patient-flow.ts` (`timerFlowUpdates`), `src/lib/patient-flow.test.ts`
- Modify: `src/app/api/admin/rooms/[id]/timer/route.ts`
- Modify: `src/app/admin/rooms/RoomTile.tsx`
- Modify: `CLAUDE.md`

**Interfaces — produces:** `TimerAction` gains `"again"`. Nothing else changes shape; `useRooms.timerAction` and `previewTimerFlow` pick it up through the shared functions.

- [ ] **Step 1: Write the failing tests**

`src/lib/room-status.test.ts`, in `describe("timerActionUpdate")`:

```ts
  it("again starts another session from the room default and ends setting up", () => {
    const settingUp = { ...baseRoom, turnover_started_at: iso(T0) };
    expect(timerActionUpdate(settingUp, "again", T0 + 1000)).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0 + 1000),
        timer_duration_seconds: baseRoom.default_duration_seconds,
        timer_paused_at: null,
        turnover_started_at: null,
      },
    });
  });
  it("again is refused unless the room is setting up", () => {
    const refused = { ok: false, error: "Room is not setting up" };
    expect(timerActionUpdate(baseRoom, "again", T0)).toEqual(refused);
    expect(timerActionUpdate(running(), "again", T0)).toEqual(refused);
  });
```

and make the existing "ready fails when the room is not turning over" test also assert the text: `expect(timerActionUpdate(baseRoom, "ready", T0)).toEqual({ ok: false, error: "Room is not setting up" })`.

`src/lib/patient-flow.test.ts`, in `describe("timerFlowUpdates")` (`roomAfter` is the room once the action is applied: timer running, not setting up):

```ts
  it("again finishes nobody and calls nobody, with or without the route's flag", () => {
    const visits = [treating("x"), nextUp("a")];
    expect(timerFlowUpdates("again", room(timerRunning), visits, T0)).toEqual([]);
    expect(
      timerFlowUpdates("again", room(timerRunning), visits, T0, { wasTurningOver: true })
    ).toEqual([]);
  });
  it("again marks a late partner as seen, like start", () => {
    const visits = [treating("x"), called("y")];
    expect(timerFlowUpdates("again", two(timerRunning), visits, T0)).toEqual([
      { id: "y", fields: { seen_at: iso(T0) } },
    ]);
  });
  it("a line kept through another session is still called by room ready", () => {
    const visits = [treating("x"), nextUp("a")];
    const afterAgain = applyVisitUpdates(visits, timerFlowUpdates("again", room(timerRunning), visits, T0));
    const updates = timerFlowUpdates("ready", room(), afterAgain, T0);
    expect(updates).toEqual([
      { id: "x", fields: { done_at: iso(T0) } },
      { id: "a", fields: { called_at: iso(T0) } },
    ]);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test -- src/lib/room-status.test.ts src/lib/patient-flow.test.ts`
Expected: FAIL (`"again"` is not a `TimerAction`; error text differs).

- [ ] **Step 3: Implement**

- `room-status.ts`: add `"again"` to `TimerAction`; new `case "again"` in `timerActionUpdate` (valid only when the timer is idle and `turnover_started_at` is set; fields as in the test); change the `ready` error text to `Room is not setting up`. Update comments that say "turning over" where they describe what staff see.
- `patient-flow.ts` `timerFlowUpdates`: `"again"` returns `doctorInUpdates(roomAfter.id, visits, nowMs)` — the same as an ordinary `start`, and never the `wasTurningOver` branch. Extend the function's header comment.
- `timer/route.ts`: add `"again"` to the zod enum; extend the header comment ("again = another session for the people already in the room: nobody finished, nobody called").

- [ ] **Step 4: Run** — `npm test` — Expected: PASS.

- [ ] **Step 5: `RoomTile.tsx` — the Setting Up tile**

- `STATUS_STYLES.turnover.label` → `"Setting Up"`.
- The `turningOver` branch stops being "one button only". It shows the same time control as the idle tile (− / tappable time / +, sharing the existing JSX — lift it into a const rendered by both branches) and, under it, two buttons:
  - `Another session` → `onAction("again")`, secondary look (`bg-white/20`)
  - `Room ready` → `onAction("ready")`, primary look (the existing white button, `DoorOpen` icon)
- Both labels must be fully readable at the tile's size on the iPads (stack the buttons if side by side truncates); both disabled while `busy`. Update the comment above the branch: needles are out or the next session is being set up; nobody is called in until staff confirm the room is empty.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint` — Expected: all pass.
Run: `grep -rn -i "turning over" src CLAUDE.md` — Expected: no staff-visible string left (code comments that describe the `turnover` status by its identifier are fine).

- [ ] **Step 7: CLAUDE.md**

- Route list, `/api/admin/rooms/[id]/timer`: actions `start/pause/resume/adjust/set/reset/clear/ready/again`.
- "Room status with no timer running": `turnover_started_at set → Setting Up`.
- The "✓ (clear)" bullet: ✓ silences the alarm and starts Setting Up; from there "Room ready" finishes the room's patients and calls whoever is lined up, and "Another session" (`again`) starts the timer again for the same patients — fire cupping is two 8-minute sessions — finishing nobody and calling nobody. Keep the sentence about Start sent during turnover, with "Setting Up" as the state name.
- Replace remaining "Turning over" / "turning over" with "Setting Up" / "setting up".

- [ ] **Step 8: Commit**

```bash
git add src/lib src/app/admin/rooms/RoomTile.tsx "src/app/api/admin/rooms/[id]/timer/route.ts" CLAUDE.md
git commit -m "feat(rooms): another session from Setting Up; rename Turning over"
```

---

### Task 4: See it working on the board

No real Supabase credentials exist on this machine. The rules and routes are covered by the unit tests; this task checks the screens. Use a production build with dummy env, a minted staff cookie, and Playwright with the server simulated by `page.route` (answering `GET /api/admin/rooms` and the two POST routes from an in-test copy of the state, using the repo's own pure functions so the simulation cannot drift). Put scripts and screenshots in the session scratchpad, not the repo.

**Files:** none in the repo.

- [ ] **Step 1: Build**

Run: `NEXTAUTH_SECRET=x NEXTAUTH_URL=http://localhost:3000 NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x ALLOWED_ADMIN_EMAILS=staff@example.com npm run build`
Expected: build succeeds.

- [ ] **Step 2: Walk the board in Chromium and WebKit at 1024×768** (the iPads are WebKit), one 2-bed room and one 1-bed room, capturing `pageerror` events and a screenshot per step:

1. Single patient → empty 2-bed room: sent in, no question.
2. Second patient → that room: panel "Together with …?"; `No, next up` posts no `togetherWith`; the patient shows under "Next:".
3. Third patient → that room: panel "(next up)"; `Yes, line up together` posts `togetherWith` = the lined-up visit's id.
4. With a panel open, change the simulated room (replace the occupant) and trigger a refetch: the panel closes by itself and does not re-word.
5. ✓ → tile reads `SETTING UP`, shows the time control, `Another session` and `Room ready`, all fully readable. `Another session` → timer runs, names unchanged, line unchanged. ✓ then `Room ready` → both lined-up patients move into the room.
6. Steps 2–3 again by mouse drag: the dragged chip reads "…: together or next up?" / "…: join the line?", and the drop opens the panel (it does not vanish on drop).
7. One-bed room: tap flow shows only "Send here" / "Next up here" / "Full", as before.

Expected: no `pageerror`; every step as described. Fix anything that is not, re-run `npm test && npx tsc --noEmit && npm run lint`, and commit the fix.

- [ ] **Step 3: Report**

State what was checked this way and what was not: the real database, two physical boards racing, and the real iPads remain untested. A full run against local Supabase needs Docker and the owner's go-ahead — ask, do not start it.
