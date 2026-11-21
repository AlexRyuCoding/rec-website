# Shared rooms and repeat sessions — design

Date: 2026-11-21. Builds on
`docs/superpowers/specs/2026-11-19-patient-room-flow-design.md` (the
"flow spec"). Where the two disagree, this document wins.

## Intent

Two things happen in the clinic that the rooms board gets wrong today.

1. **A multi-bed room is private to one group.** People share a room only
   when they came together (family, friends, a couple). Everyone else is
   a separate patient who needs the room to themselves — including a
   single patient who happens to be given a multi-bed room. Today the
   board sends any second patient straight into a shared room with a
   spare bed, and on "Room ready" it calls in everyone lined up, whether
   or not they belong together.
2. **A patient can have several timed sessions in a row.** Fire cupping
   is two 8-minute sessions back to back; a patient may also have two
   different services one after the other. Between sessions the patient
   stays in the room: the doctor goes in when the timer ends, sets up the
   next session, walks out and starts the next timer at the board. Today
   the only button after ✓ is "Room ready", which finishes the patient.

## Decisions made by the owner

- A room holds **one group at a time**; one timer per room stays. (Per-bed
  or per-patient timers were offered and declined.)
- Staff say whether people are together. Nothing is inferred.
- A second group may be **lined up** behind a room while the first group
  is being treated, and is called in once the first group is done. A
  group in line may itself be a couple.
- A single patient may use a multi-bed room and gets it to themselves.
- Repeat sessions are started **by the doctor at the board, after
  walking out** of the room ("approach A"): ✓ silences the alarm as it
  does today, and the tile then offers "Another session" next to "Room
  ready".
- The tile label **"Turning over" becomes "Setting Up"**.

Everything else below is the designer's call, marked *(call)* where a
different choice would be reasonable.

## Goals

- A patient is never sent into a room that has someone in it unless a
  staff member has just said they are together.
- A couple can be sent in together, and a couple can wait in line
  together.
- A doctor can run a second (third, …) timed session for the people in
  the room with one tap, without the patient being finished or the next
  patient being called.

## Non-goals

- Per-bed or per-patient timers.
- Planning sessions up front ("2 × 8"), a session counter on the tile, or
  reading the service from Practice Better to decide session lengths.
- Storing groups in the database (see Approaches).
- Changing how a room remembers its time: typing or stepping the time on
  a tile with no timer running still changes that room's default, as
  today. After an 8-minute cupping patient the room shows 8:00 until
  someone changes it.
- No database migration.

## Anti-goals

- **Privacy must fail closed.** A board that has not been reloaded, a
  request that arrives after the room changed, and the automatic
  promotion rule must each never put a patient into an occupied room
  without an explicit "together" answer. When in doubt the patient is
  lined up or the request is refused — never sent in.
- Patient names still never travel on the Realtime channel (flow spec).

## Approaches

**Shared rooms.**

1. *A group is whoever is in the room; another group is whoever is in
   its line* — chosen. Because a room holds one group and its line holds
   one group, "who is together" is already answered by where each visit
   is. The only new input is the staff member's "yes, together with
   these people", sent with the assignment. No schema change.
2. *Store a group id on each visit.* Would allow several groups in one
   line, or strangers in one room, neither of which the clinic wants.
   Needs a migration and group-management UI. Rejected.
3. *A "private / shared" switch on the room.* Cannot express a couple
   using Room 5 in the morning and a single patient in the afternoon.
   Rejected.

**Repeat sessions.**

- *A. Choose on the way out* — chosen by the owner. After ✓ the tile
  offers "Another session" and "Room ready". One new timer action, no
  schema change, the routine at the alarm is unchanged.
- *B. Choose at the alarm.* A second button when time is up. Accurate
  status between sessions, but a ✓ tapped out of habit still needs A's
  button, so it is A plus a second decision point.
- *C. Plan sessions up front.* Shows "Session 1 of 2" and tells the
  front desk how long the room is taken; needs a migration, more
  controls on a small tile, and planning by the doctor at the start.

## 1. Who may enter a room

All rules live in `src/lib/patient-flow.ts` (pure, tested) and are
applied by `POST /api/admin/visits/[id]`.

Terms, for room R with the patient being assigned left out of the lists
(as `assignUpdate` already does): **occupants** = visits called to R and
not done; **line** = visits assigned to R and not yet called.

### Assign outcome

`assignOutcome(room, visits)` returns one of five values. The first
matching row wins.

| # | Room state                                             | Outcome         |
|---|--------------------------------------------------------|-----------------|
| 1 | line length ≥ capacity                                 | `full`          |
| 2 | line not empty                                         | `ask_join_line` |
| 3 | Setting Up (`turnover_started_at` set)                 | `next_up`       |
| 4 | no occupants, timer running (hand-started for nobody)  | `next_up`       |
| 5 | no occupants                                           | `send`          |
| 6 | occupants < capacity                                   | `ask_join_room` |
| 7 | occupants ≥ capacity                                   | `next_up`       |

A one-bed room can only produce `send`, `next_up` and `full`, exactly as
today. Rows 2 and 6 are new and only arise in rooms with 2+ beds.

Row 2 comes before everything else on purpose: nobody is ever placed
ahead of people already lined up, and a room with a line takes at most
one more group — so the only thing a new patient can do there is join
that group.

### The staff answer

A "yes" is a yes to **named people**, not to a room. The assign request
gains an optional list of visit ids:
`{ action: "assign", roomId, togetherWith?: string[] }` — the visits the
question panel named when staff tapped Yes. Absent or empty means "not
together". The server computes the outcome from fresh data and resolves
it:

| Outcome         | `togetherWith` absent or empty                   | `togetherWith` given                                             |
|-----------------|--------------------------------------------------|------------------------------------------------------------------|
| `send`          | called now                                       | 409 changed                                                      |
| `next_up`       | lined up                                         | 409 changed                                                      |
| `ask_join_room` | lined up                                         | same ids as the room's occupants → called now; else 409 changed  |
| `ask_join_line` | 409 "{room} already has someone waiting for it"  | same ids as the room's line → lined up; else 409 changed         |
| `full`          | 409 (as today)                                   | 409 (as today)                                                   |

"Same ids" is set equality, order ignored. "409 changed" is one message,
"{room} changed — please choose again"; the board refetches on any
failed action already, so staff see the room as it is now and choose
again.

Two things make privacy fail closed:

- *Absent means not together.* A board that was never reloaded, or that
  showed "Send here" for a room someone else filled a moment earlier,
  sends no list and the patient is lined up instead of walking in on
  someone.
- *A yes only counts for the people it named.* A board can show
  "Together with Alex R.?" while another board changes who is in the
  room or its line (boards can be up to a minute behind when the live
  connection is blocked, which happens on the iPads). The yes is then
  refused rather than applied to whoever is there now.

A patient who joins a room whose timer is already running is handled as
the flow spec's "late partner" (unchanged).

### Only from the waiting list (added after the branch review)

An assign for a visit that already has a room (in it, or lined up for
it) is refused: 409 "That patient already has a room — please choose
again". The board only offers rooms for patients in the waiting list, so
such a request can only come from a board whose picture is out of date —
and moving the patient would mark the room they are physically in as
empty and call its line in on them. This replaces the flow spec's "an
assigned patient can be moved by assigning again"; to move someone,
staff use "Back to waiting list" first, as the board already requires.

### Late partners that the table does not let in *(call)*

Two cases line a partner up instead of offering "together", on purpose:

- **Setting Up, spare bed, no line (row 3).** The board cannot tell
  whether the people in the room are leaving or staying for another
  session, and "Room ready" finishes everyone in the room — a latecomer
  sent in now would be finished without being treated. Lined up, they
  are called when the room is ready.
- **A room that already has a line (row 2).** The only offer is to join
  the line, even if the newcomer belongs with the people in the room.

Both fail safe (nobody walks in on anybody). The way round is the
existing one: send a name back to the waiting list and assign again.

`hasFreeBedNow` loses its only other caller's meaning with this table;
keep, reshape or remove it as the implementation prefers.

### Promotion

`promotionUpdates` calls the line only when the room has **no occupants
at all**, no timer running and is not Setting Up. It then calls the whole
line (at most `capacity`, oldest first), because the line is one group.

This replaces "has a free bed". The case it closes: one of a couple
leaves early (staff remove that name) while a patient is lined up — today
the freed bed pulls the lined-up patient in beside the partner who is
still there. Routes keep running the rule after every change, so the
line is still called the moment the room really empties, whatever
emptied it (Room ready, last occupant removed or moved, reset of a
hand-started timer).

### Known limit (unchanged from the flow spec)

Assignments are read-then-write. Two boards assigning two different
patients to the same empty shared room in the same instant can both be
sent in. The tile shows both names and staff move one. Still not worth a
transaction for one clinic.

The same instant-race exists for two boards answering "No, next up" for
two unrelated patients on the same room (both are lined up, and "Room
ready" would call them together — the tile shows "Next: P, Q" until
then), and for a "Yes" racing a "Room ready". Same class, same
acceptance.

## 2. Asking "Together?" on the board

Files: `src/app/admin/rooms/page.tsx`, `RoomTile.tsx`, `WaitingList.tsx`,
`useRooms.ts`.

Tap-then-tap and mouse drag stay the same action. For the three existing
outcomes nothing changes. For the two new ones, tapping the tile (or
dropping the chip on it) does not assign yet; the tile shows a question
panel over itself, in the style of the existing patient menu:

```
Sam T. → Room 5
Together with Alex R.?
[ Yes, send in     ]
[ No, next up      ]
  Cancel
```

and for a room that already has a line:

```
Sam T. → Room 5
Together with Dana K. (next up)?
[ Yes, line up together ]
  Cancel
```

- The names shown are the occupants (`ask_join_room`) or the line
  (`ask_join_line`), as "First L.", joined with "&" when there are two or
  more.
- "Yes" sends `togetherWith` = the ids of exactly the visits the panel
  named; "No, next up" sends no list. The second panel has no "No"
  button — the answer would be a refusal — but says in one line why:
  "Room 5 already has someone waiting for it." *(call)*
- The panel belongs to one patient, one room, one kind of question and
  one set of named people, all fixed when it opens. It closes on Cancel,
  on a tap outside the tile, and by itself as soon as any of those no
  longer matches the board's data: the patient left the waiting list,
  the room's outcome changed, or the people it would name changed. It
  never re-words itself in place — a different name must not appear
  under a finger already heading for Yes. It must not be dismissed by
  the pointer-down that the drop itself produces.
- When it closes by itself, the tile shows "{room} changed — choose
  again" and takes no presses for 2.5 s, whether or not a patient is
  still selected. Without this the tap already on its way to "Yes" would
  land on whatever the tile shows next: a new question about other
  people, "Send here", or the room's own Start / Room ready. (Added
  after the branch review.)
- The answer buttons are at least 40 px tall and 8 px apart, and ignore
  presses for 350 ms after the panel opens (it appears under the finger
  that just tapped the tile).
- While the panel is open the patient stays selected in the waiting
  list, so staff can see who the question is about.
- Before the tap/drop, the tile's assign overlay and the dragged chip
  must not promise an outcome for these rooms. Suggested wording: tile
  "Together or next up…" / "Join the line…"; dragged chip "Room 5:
  together or next up?" / "Room 5: join the line?" *(call — exact words
  are the builder's, the rule is: no promise the drop won't keep)*.
- The server's reply replaces the board's picture, as for every other
  assignment; a 409 shows its message in the existing error strip.

Touch rules from CLAUDE.md stay: MouseSensor only for dragging; the
iPads use tap-then-tap. The panel's buttons must be comfortable finger
targets on the iPad tile.

## 3. Another session

Files: `src/lib/room-status.ts`, `src/lib/patient-flow.ts`,
`src/app/api/admin/rooms/[id]/timer/route.ts`, `RoomTile.tsx`.

New timer action **`again`**:

- Valid only when no timer is running and `turnover_started_at` is set;
  otherwise 409.
- Room fields: `timer_started_at = now`, `timer_duration_seconds =
  default_duration_seconds`, `timer_paused_at = null`,
  `turnover_started_at = null`.
- Patients: nobody is finished and nobody is called. Any occupant not yet
  marked seen (a late partner) is marked seen, exactly as Start does.
- It is a different action from `start` on purpose: `start` during
  Setting Up keeps its existing meaning ("Room ready + Start", sent only
  by a board that was not reloaded) and must not change.

The Setting Up tile, which today shows only "Room ready", becomes:

```
Room 3 · Dr. Ryu
Alex R.
   −   8:00   +
[ Another session ]  [ Room ready ]
SETTING UP
```

- The time control is the normal one (− / type / +). With no timer
  running it edits the room's default, as on an Available tile; "Another
  session" starts with the time shown. So fire cupping is: ✓, set up,
  walk out, one tap. A different second service is: change the time,
  one tap.
- "Room ready" stays the more prominent button — it is the common case.
  *(call)* Layout (side by side or stacked) is the builder's, within the
  tile's fixed size; both labels must be readable on the iPads.
- A mistaken "Another session" is undone with ✓, which returns the tile
  to Setting Up.
- The running session looks like any other: "In Use", same alarm sounds
  when it ends. No session counter. *(call)*
- The acting board applies it optimistically like other timer actions
  (`useRooms.timerAction` + `previewTimerFlow` already share the pure
  rules).

## 4. "Setting Up"

The label of the `turnover` status on the tile changes from "Turning
over" to "Setting Up". Staff-visible strings that say "turning over"
(the 409 text of `ready`) change to match. Code identifiers, the status
value `turnover` and the column `turnover_started_at` keep their names
*(call: a rename buys nothing and would need a migration)*.

CLAUDE.md is updated in the same change: "Patient room flow" (status
names, the assign and promotion rules, the new action, the
`togetherWith` field on the visits route) and the route list.

## Left to the builder

- Function shapes in `patient-flow.ts`, as long as the two tables and
  the promotion rule above hold and the board and the server use the
  same pure function for the outcome.
- Exact wording and layout of the panel, the assign overlay and the
  dragged chip, within the rules in section 2.
- Whether the panel's state lives in `page.tsx` or the tile.

## Testing

Unit (vitest, `npm test`):

- `assignOutcome`: every row of the table for capacity 1 and 2, in the
  stated order of precedence (e.g. Setting Up with a line → row 2, not
  row 3).
- `assignUpdate` with `togetherWith` absent, empty, matching and not
  matching for each outcome, including: absent on `ask_join_room` lines
  the patient up; absent on `ask_join_line` is refused; a yes naming
  the occupants is refused once a line has appeared, once the line it
  named is gone, and once the occupant has been replaced by someone
  else; the patient being assigned does not count against the room they
  are already in.
- `promotionUpdates`: nobody called while any occupant remains; the
  whole line called when the room empties; a couple in line called
  together; unchanged for one-bed rooms.
- `timerActionUpdate("again")`: valid only during Setting Up; resulting
  fields. `timerFlowUpdates("again")`: nobody finished, nobody promoted
  (a line stays a line), unseen occupants marked seen.
- Existing tests that encode the old rules ("a late partner can join a
  two-bed room mid-treatment", "calls only as many as there are beds")
  are rewritten to the new ones, not deleted.

By hand, on the board (local Supabase, see project memory), with one
2-bed room and one 1-bed room:

1. Single patient into the empty 2-bed room → sent in, no question.
2. Second patient onto it → question; "No, next up" → lined up, not on
   the waiting-room TV.
3. Third patient onto it → "join the line" question; Yes → both in line.
4. ✓ → Setting Up; "Another session" → timer runs, nobody called, line
   intact. ✓, then "Room ready" → both lined-up patients called
   together.
5. Couple in the room, one removed, a patient in line → nobody called
   until the room is empty.
6. Steps 2–3 again with the mouse (drag and drop).
7. One-bed room behaves exactly as before.
