// Pure rules for moving patients through rooms. A visit is one checkins
// row; its place in the flow is derived from timestamps (assigned ->
// called -> seen -> done), the same way room-status.ts derives a room's
// status from its timer timestamps. Nothing here touches the database or
// the clock: routes pass in rows and `now`, and get back the row updates
// to write. Staff choose the room; these rules only decide whether the
// patient can walk in now or has to be lined up, and who gets called when
// a bed frees.

export const VISIT_ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
// How long a call stays on the waiting-room screen (and how long a name
// is marked as "arriving" on the staff board).
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

// What the staff board receives. Only active visits are sent, so there is
// no done_at, and the name is already reduced to first name + initial.
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

type InRoom = Pick<
  FlowVisit,
  "id" | "room_id" | "room_assigned_at" | "called_at" | "seen_at"
>;

// "Alex R." — the only form of a patient's name that leaves the server
// for the board or the waiting-room screen.
export function displayName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  const firstName = (first ?? "").trim();
  if (!firstName) return "Guest";
  const initial = (last ?? "").trim().charAt(0).toUpperCase();
  return initial ? `${firstName} ${initial}.` : firstName;
}

// Open visits older than the window are leftovers (nobody tapped Room
// ready, or the patient never got a room) and silently drop off.
export function isActiveVisit(
  v: Pick<FlowVisit, "checked_in_at" | "done_at">,
  nowMs: number
): boolean {
  if (v.done_at !== null) return false;
  return nowMs - Date.parse(v.checked_in_at) <= VISIT_ACTIVE_WINDOW_MS;
}

export function visitState(
  v: Pick<FlowVisit, "room_id" | "called_at" | "seen_at">
): VisitState {
  // No room wins over everything: deleting a room nulls room_id and the
  // visit must fall back to the waiting list whatever else is set.
  if (v.room_id === null) return "waiting";
  if (v.called_at === null) return "next_up";
  return v.seen_at === null ? "called" : "treating";
}

// Patients told to go to (or already being treated in) this room.
export function roomOccupants<T extends InRoom>(
  visits: T[],
  roomId: string
): T[] {
  return visits.filter((v) => v.room_id === roomId && v.called_at !== null);
}

// Patients who are in (or on their way to) this room and have not been
// seen by the doctor yet. While there are any, the room is "Patient
// waiting" and the board shows its alert.
export function roomWaitingForDoctor<T extends InRoom>(
  visits: T[],
  roomId: string
): T[] {
  return roomOccupants(visits, roomId).filter((v) => v.seen_at === null);
}

// Patients lined up behind this room, in the order staff lined them up.
export function roomNextUp<T extends InRoom>(visits: T[], roomId: string): T[] {
  return visits
    .filter((v) => v.room_id === roomId && v.called_at === null)
    .sort(
      (a, b) =>
        Date.parse(a.room_assigned_at ?? "") -
        Date.parse(b.room_assigned_at ?? "")
    );
}

// Can a patient walk into this room right now?
export function hasFreeBedNow(room: FlowRoom, visits: InRoom[]): boolean {
  if (room.turnover_started_at !== null) return false;
  const occupants = roomOccupants(visits, room.id).length;
  if (occupants >= room.capacity) return false;
  // Never jump ahead of people already lined up for the room.
  if (roomNextUp(visits, room.id).length > 0) return false;
  // A running timer with nobody tracked means staff started it by hand
  // for a patient the board doesn't know about: the room is busy. With a
  // tracked occupant and a spare bed it is a shared room mid-treatment,
  // and a late partner may join.
  return room.timer_started_at === null || occupants >= 1;
}

export type AssignOutcome = "send" | "next_up" | "full";

// What assigning one more patient to this room would do. `visits` must
// not include the patient being assigned.
export function assignOutcome(room: FlowRoom, visits: InRoom[]): AssignOutcome {
  if (hasFreeBedNow(room, visits)) return "send";
  return roomNextUp(visits, room.id).length < room.capacity
    ? "next_up"
    : "full";
}

export function applyVisitUpdates<T extends { id: string }>(
  visits: T[],
  updates: { id: string; fields: Partial<T> }[]
): T[] {
  return visits.map((v) => {
    let next = v;
    for (const u of updates) {
      if (u.id === v.id) next = { ...next, ...u.fields };
    }
    return next;
  });
}

export function assignUpdate(
  room: FlowRoom,
  visits: FlowVisit[],
  visitId: string,
  nowMs: number
): { ok: true; updates: VisitUpdate[] } | { ok: false; error: string } {
  if (!visits.some((v) => v.id === visitId)) {
    return { ok: false, error: "Visit not found" };
  }
  // The patient may already be in (or lined up for) this very room;
  // they must not count against it.
  const others = visits.filter((v) => v.id !== visitId);
  const outcome = assignOutcome(room, others);
  if (outcome === "full") {
    return { ok: false, error: "That room already has patients lined up" };
  }
  const now = new Date(nowMs).toISOString();
  return {
    ok: true,
    updates: [
      {
        id: visitId,
        fields: {
          room_id: room.id,
          room_assigned_at: now,
          called_at: outcome === "send" ? now : null,
          seen_at: null,
        },
      },
    ],
  };
}

export function unassignUpdate(visitId: string): VisitUpdate {
  return {
    id: visitId,
    fields: {
      room_id: null,
      room_assigned_at: null,
      called_at: null,
      seen_at: null,
    },
  };
}

export function removeUpdate(visitId: string, nowMs: number): VisitUpdate {
  return { id: visitId, fields: { done_at: new Date(nowMs).toISOString() } };
}

// The doctor has walked into the room: every patient waiting there is now
// seen. This is what "seen" means from here on — it happens when the
// doctor taps "Doctor in", or at the latest when the timer is started
// (needles in). Seen patients drop off the waiting-room screen and the
// room stops alerting.
export function doctorInUpdates(
  roomId: string,
  visits: FlowVisit[],
  nowMs: number
): VisitUpdate[] {
  const now = new Date(nowMs).toISOString();
  return roomWaitingForDoctor(visits, roomId).map((v) => ({
    id: v.id,
    fields: { seen_at: now },
  }));
}

// Undo for a mistaken "Doctor in" (wrong tile, wrong person tapping): the
// patient is waiting again and the alert comes back. Without this, one
// stray tap could leave a patient sitting in a room with nobody coming.
export function markWaitingUpdate(visitId: string): VisitUpdate {
  return { id: visitId, fields: { seen_at: null } };
}

// The rule that keeps a lined-up patient from being stranded: whenever a
// room is idle (no timer, not turning over) and has a free bed, the
// people lined up for it are called, oldest first. Routes run this after
// every change that touches a room, so it does not matter *why* the bed
// came free (Room ready, a no-show removed, a patient moved, a reset).
export function promotionUpdates(
  room: FlowRoom,
  visits: FlowVisit[],
  nowMs: number
): VisitUpdate[] {
  if (room.timer_started_at !== null || room.turnover_started_at !== null) {
    return [];
  }
  const freeBeds = room.capacity - roomOccupants(visits, room.id).length;
  if (freeBeds <= 0) return [];
  const now = new Date(nowMs).toISOString();
  return roomNextUp(visits, room.id)
    .slice(0, freeBeds)
    .map((v) => ({ id: v.id, fields: { called_at: now } }));
}

// What a timer button does to the patients in the room. `visits` is the
// state before the action; `roomAfter` already carries the new timer
// fields. Actions that don't move patients return nothing.
//
// wasTurningOver: the room was turning over when Start arrived (only a
// board on an older version of the page can send that). It is then
// "Room ready" followed by Start: last session's patients are finished,
// whoever was lined up takes the beds, and they are the ones being
// treated.
export function timerFlowUpdates(
  action: string,
  roomAfter: FlowRoom,
  visits: FlowVisit[],
  nowMs: number,
  opts: { wasTurningOver?: boolean } = {}
): VisitUpdate[] {
  const now = new Date(nowMs).toISOString();

  if (action === "start" && opts.wasTurningOver) {
    const idleRoom = {
      ...roomAfter,
      timer_started_at: null,
      turnover_started_at: null,
    };
    const readyUpdates = timerFlowUpdates("ready", idleRoom, visits, nowMs);
    const afterReady = applyVisitUpdates(visits, readyUpdates).filter(
      (v) => v.done_at === null
    );
    return [
      ...readyUpdates,
      ...timerFlowUpdates("start", roomAfter, afterReady, nowMs),
    ];
  }

  const occupants = roomOccupants(visits, roomAfter.id);

  if (action === "start") {
    // Starting the timer (needles in) implies the doctor is in, for
    // anyone not already marked seen with "Doctor in".
    return doctorInUpdates(roomAfter.id, visits, nowMs);
  }

  let updates: VisitUpdate[];
  if (action === "ready") {
    // The room is empty: everyone in it is finished.
    updates = occupants.map((v) => ({ id: v.id, fields: { done_at: now } }));
  } else if (action === "reset") {
    // The timer was a mistake, not the end of the visit. The patients
    // stay, and stay "seen": whoever started the timer was in the room,
    // so cancelling it must not re-raise the "patient waiting" alert.
    // (Only the promotion below can apply — a hand-started timer for
    // nobody frees the room for whoever was lined up.)
    updates = [];
  } else {
    return [];
  }

  const after = applyVisitUpdates(visits, updates).filter(
    (v) => v.done_at === null
  );
  return [...updates, ...promotionUpdates(roomAfter, after, nowMs)];
}

// Credentials and titles that appear in names but identify nobody.
const NAME_NOISE = new Set(["dr", "lac", "dacm", "daom"]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\./g, "") // "L.Ac." -> "lac"
    .split(/[^\p{L}]+/u)
    .filter((t) => t && !NAME_NOISE.has(t));
}

// Which roster doctor is this Practice Better practitioner? A roster
// entry matches when all of its words appear in the PB name, so staff can
// keep short roster names ("Ryu") against PB's full ones ("Alex Ryu").
// Anything but exactly one match is treated as unknown — a wrong doctor
// on a tile is worse than none.
export function matchRosterDoctor(
  pbName: string | null,
  roster: { name: string }[]
): string | null {
  if (!pbName) return null;
  const pbTokens = new Set(nameTokens(pbName));
  const matches = roster.filter((doctor) => {
    const tokens = nameTokens(doctor.name);
    return tokens.length > 0 && tokens.every((t) => pbTokens.has(t));
  });
  return matches.length === 1 ? matches[0].name : null;
}

// The doctor a room's pill should switch to after these updates: the
// roster doctor of the last patient just called, or null to leave the
// pill as it is.
export function doctorForCalls(
  updates: VisitUpdate[],
  visits: FlowVisit[],
  roster: { name: string }[]
): string | null {
  let doctor: string | null = null;
  for (const update of updates) {
    if (!update.fields.called_at) continue;
    const visit = visits.find((v) => v.id === update.id);
    const match = matchRosterDoctor(visit?.practitioner_name ?? null, roster);
    if (match) doctor = match;
  }
  return doctor;
}

// What the staff board should show right after a timer button is tapped,
// before the server answers — the same rules the server applies, run on
// the board's own list, so a tile never flashes a stale state (a finished
// patient still listed after "Room ready"). The server's reply replaces
// this either way.
export function previewTimerFlow(
  action: string,
  roomAfter: FlowRoom,
  views: VisitView[],
  nowMs: number
): VisitView[] {
  const asVisits = views.map((v) => ({ ...v, done_at: null }));
  const updates = timerFlowUpdates(action, roomAfter, asVisits, nowMs);
  if (updates.length === 0) return views;
  const finished = new Set<string>();
  return views
    .map((view) => {
      let next = view;
      for (const update of updates) {
        if (update.id !== view.id) continue;
        const { done_at: doneAt, ...fields } = update.fields;
        if (doneAt) finished.add(view.id);
        next = { ...next, ...fields };
      }
      return next;
    })
    .filter((view) => !finished.has(view.id));
}
