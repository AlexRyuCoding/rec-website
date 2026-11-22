// Expected arrivals: today's Practice Better appointments whose patients
// have not checked in yet. Pure — what a Practice Better session means
// to us, and what the rooms board shows. Fetching and caching the day's
// schedule is expected-server.ts.

import { CLINIC_TZ } from "./clinic-time";
import { displayName } from "./patient-flow";

// One appointment of the day, reduced to what the board needs. No name:
// the patient is found in our own table by their Practice Better id.
export interface DaySession {
  pbClientId: string;
  // ISO timestamp of the appointment's start.
  at: string;
  practitioner: string | null;
  service: string | null;
}

const clinicDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// Practice Better's list of sessions, read defensively: it is someone
// else's data, and a field that is missing or of another type must drop
// that one session rather than break the board. Kept: not cancelled, has
// a client record and a start time, and is on `dayYmd` in the clinic's
// timezone. (Group sessions with no single client record fall out here.)
export function parsePbSessions(items: unknown, dayYmd: string): DaySession[] {
  if (!Array.isArray(items)) return [];
  const sessions: DaySession[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.cancelled === true) continue;
    const record = item.clientRecord as Record<string, unknown> | undefined;
    const pbClientId = text(record?.id);
    const at = text(item.sessionDate);
    if (!pbClientId || !at) continue;
    const startMs = Date.parse(at);
    if (Number.isNaN(startMs) || clinicDay(startMs) !== dayYmd) continue;

    const consultant = item.consultant as Record<string, unknown> | undefined;
    const profile = consultant?.profile as Record<string, unknown> | undefined;
    const practitioner =
      `${text(profile?.firstName) ?? ""} ${text(profile?.lastName) ?? ""}`.trim() ||
      null;
    const service = item.service as Record<string, unknown> | undefined;
    sessions.push({
      pbClientId,
      at: new Date(startMs).toISOString(),
      practitioner,
      service: text(service?.name),
    });
  }
  return sessions.sort((a, b) => a.at.localeCompare(b.at));
}

// From this many minutes past the appointment time the row is "late"…
export const LATE_AFTER_MIN = 10;
// …and from this many it is probably a no-show.
export const VERY_LATE_AFTER_MIN = 30;

export type ArrivalStatus = "upcoming" | "due" | "late" | "very_late";

export function arrivalStatus(atIso: string, nowMs: number): ArrivalStatus {
  const minutesPast = (nowMs - Date.parse(atIso)) / 60_000;
  if (minutesPast < 0) return "upcoming";
  if (minutesPast < LATE_AFTER_MIN) return "due";
  return minutesPast < VERY_LATE_AFTER_MIN ? "late" : "very_late";
}

// "in 25 min", "now", "12 min late", "1 h 5 min late".
export function arrivalLabel(atIso: string, nowMs: number): string {
  const minutes = Math.round((Date.parse(atIso) - nowMs) / 60_000);
  const span = (m: number) =>
    m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  if (minutes > 0) return `in ${span(minutes)}`;
  if (minutes === 0) return "now";
  return `${span(-minutes)} late`;
}

// A row of the board's "Expected" list.
export interface ExpectedRow {
  // Our patient id — what "Check in" sends.
  patientId: string;
  // "First L.", like every name on the board.
  displayName: string;
  at: string;
  practitioner: string | null;
  service: string | null;
}

interface KnownPatient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  pb_client_id: string | null;
}

// Who is still expected today: one row per patient (their first
// appointment of the day), in order of time, leaving out everyone who
// has checked in today.
//
// `unmatched` counts appointments whose patient is not in our table —
// the record has not arrived from Practice Better yet. They cannot be
// listed (we have no name for them) or checked in; the board says how
// many there are and where to fix it.
export function expectedRows(
  sessions: DaySession[],
  patients: KnownPatient[],
  checkedInPatientIds: Iterable<string>
): { rows: ExpectedRow[]; unmatched: number } {
  const byPbId = new Map(
    patients.filter((p) => p.pb_client_id).map((p) => [p.pb_client_id!, p])
  );
  const checkedIn = new Set(checkedInPatientIds);
  const seenPbIds = new Set<string>();
  const rows: ExpectedRow[] = [];
  let unmatched = 0;
  for (const session of [...sessions].sort((a, b) =>
    a.at.localeCompare(b.at)
  )) {
    if (seenPbIds.has(session.pbClientId)) continue;
    seenPbIds.add(session.pbClientId);
    const patient = byPbId.get(session.pbClientId);
    if (!patient) {
      unmatched++;
      continue;
    }
    if (checkedIn.has(patient.id)) continue;
    rows.push({
      patientId: patient.id,
      displayName: displayName(patient.first_name, patient.last_name),
      at: session.at,
      practitioner: session.practitioner,
      service: session.service,
    });
  }
  return { rows, unmatched };
}

// How long a fetched schedule is used before Practice Better is asked
// again. Practice Better allows 10,000 requests a day for everything the
// clinic does with it; every tablet shares this one copy, so the list
// costs a few hundred requests a day however many boards are open.
export const SCHEDULE_TTL_MS = 5 * 60 * 1000;
// "Refresh" asks again sooner, but not more often than this.
export const SCHEDULE_MIN_REFRESH_MS = 30 * 1000;

// Should Practice Better be asked now? `fetchedAtMs` is when the copy we
// hold was fetched; null = we hold none.
export function scheduleIsStale(
  fetchedAtMs: number | null,
  nowMs: number,
  forced: boolean
): boolean {
  if (fetchedAtMs === null) return true;
  const age = nowMs - fetchedAtMs;
  return age >= (forced ? SCHEDULE_MIN_REFRESH_MS : SCHEDULE_TTL_MS);
}
