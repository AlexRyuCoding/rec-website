// How the rooms board escalates a patient who is kept waiting. Pure; the
// board's hook (useAlarm.ts) asks it once a second.
//
// A patient called into a room waits there for the doctor. The alert for
// that — the banner, the purple tile, the doorbell — used to ring once
// and then only show. So the ladder now has two rungs:
//
//   1. At the call: the doorbell rings — on tablets set to that room's
//      doctor, on tablets set to everyone, and on every tablet if the
//      room has no doctor.
//   2. After LONG_WAIT_MS with no "Doctor in": it rings on EVERY tablet,
//      whoever each is set to, and again every REPEAT_MS until someone
//      goes. The banner and the tile are marked "Long wait".
//
// Rung 1 keeps a tablet in one doctor's room from ringing for another
// doctor's patients all day. Rung 2 is why that is safe: a quiet tablet
// is never the reason a patient is forgotten.
//
// Separately, the waiting list (patients with no room yet) colours a chip
// by how long that patient has been kept — see waitLevel.

// A patient in a room this long without the doctor is a long wait.
export const LONG_WAIT_MS = 5 * 60 * 1000;
// How often the doorbell repeats once a wait is long.
export const REPEAT_MS = 3 * 60 * 1000;

// Waiting-list chips: amber from here…
export const WAIT_WARN_MS = 10 * 60 * 1000;
// …and red from here.
export const WAIT_LONG_MS = 20 * 60 * 1000;

// One patient in a room whom the doctor has not seen yet.
export interface DoctorWait {
  visitId: string;
  // The roster doctor on the room's pill; null = none assigned.
  doctorName: string | null;
  calledAtMs: number;
}

export function isLongWait(calledAtMs: number, nowMs: number): boolean {
  return nowMs - calledAtMs >= LONG_WAIT_MS;
}

// The doctors this tablet rings for. An empty list means everyone — and
// so does a list naming only doctors who are no longer on the roster: a
// tablet must not go quiet because a name was removed.
export function effectiveDoctors(
  chosen: string[],
  roster: { name: string }[]
): string[] {
  const known = new Set(roster.map((d) => d.name));
  return chosen.filter((name) => known.has(name));
}

// Is this wait this tablet's business right now? `myDoctors` is what
// effectiveDoctors returned (empty = everyone).
export function ringsOnThisTablet(
  wait: DoctorWait,
  myDoctors: string[],
  nowMs: number
): boolean {
  if (isLongWait(wait.calledAtMs, nowMs)) return true;
  if (myDoctors.length === 0) return true;
  if (wait.doctorName === null) return true;
  return myDoctors.includes(wait.doctorName);
}

// When each waiting patient last rang on this tablet.
export type RungAt = Map<string, number>;

// Should the doorbell ring now, and the bookkeeping to carry forward.
//
// - A patient this tablet rings for, who has not rung here yet: ring.
//   (For another doctor's patient that first ring comes at the long-wait
//   mark — that is rung 2 arriving on this tablet.)
// - A long wait whose last ring was REPEAT_MS or more ago: ring again.
//   This also fires the moment a wait turns long.
// - Several due at once are one ring.
// - Patients no longer waiting are forgotten, so someone put back to
//   "waiting" after a mistaken "Doctor in" rings as new.
//
// `primeOnly`: the first list a tablet loads is history, not news —
// nobody rings, but everyone waiting is noted as "rang just now", so a
// long wait still repeats REPEAT_MS after the page loaded.
export function doorbellStep(
  waits: DoctorWait[],
  myDoctors: string[],
  rungAt: RungAt,
  nowMs: number,
  primeOnly = false
): { ring: boolean; rungAt: RungAt } {
  const next: RungAt = new Map();
  let ring = false;
  for (const wait of waits) {
    const last = rungAt.get(wait.visitId);
    if (primeOnly) {
      next.set(wait.visitId, nowMs);
      continue;
    }
    if (!ringsOnThisTablet(wait, myDoctors, nowMs)) {
      // Not this tablet's yet: keep whatever is known, ring nothing.
      if (last !== undefined) next.set(wait.visitId, last);
      continue;
    }
    const due =
      last === undefined ||
      (isLongWait(wait.calledAtMs, nowMs) && nowMs - last >= REPEAT_MS);
    if (due) ring = true;
    next.set(wait.visitId, due ? nowMs : last!);
  }
  return { ring, rungAt: next };
}

export type WaitLevel = "ok" | "warn" | "long";

// How long a patient with no room yet has been KEPT waiting: from their
// appointment time, or from check-in if they arrived after it (or have no
// appointment). Someone who checks in half an hour early has not been
// kept waiting for half an hour; someone who arrives late has been
// waiting since they arrived, not since the time they missed.
export function keptWaitingMs(
  visit: { checked_in_at: string; appointment_at: string | null },
  nowMs: number
): number {
  const checkedIn = Date.parse(visit.checked_in_at);
  const appointment = visit.appointment_at
    ? Date.parse(visit.appointment_at)
    : NaN;
  const since = Number.isNaN(appointment)
    ? checkedIn
    : Math.max(checkedIn, appointment);
  return Math.max(0, nowMs - since);
}

export function waitLevel(
  visit: { checked_in_at: string; appointment_at: string | null },
  nowMs: number
): WaitLevel {
  const kept = keptWaitingMs(visit, nowMs);
  if (kept >= WAIT_LONG_MS) return "long";
  return kept >= WAIT_WARN_MS ? "warn" : "ok";
}
