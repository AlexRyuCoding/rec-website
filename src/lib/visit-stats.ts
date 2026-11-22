// What the dashboard's check-ins view says about a visit: where it
// stands, how long each part took, and the numbers for a whole day or
// month. Pure. Everything here is read off the timestamps a visit
// already collects on its way through the rooms board (patient-flow.ts):
//
//   checked_in_at → called_at (told to go to a room) → seen_at (the
//   doctor is in) → done_at (Room ready, or removed)

import { VISIT_ACTIVE_WINDOW_MS } from "./patient-flow";
import {
  deriveRoomState,
  OVERTIME_GRACE_SECONDS,
  ROOM_STATUS_LABEL,
  RoomTimer,
} from "./room-status";

// The timestamps of one check-in.
export interface VisitTimestamps {
  checked_in_at: string;
  room_id?: string | null;
  called_at: string | null;
  seen_at: string | null;
  done_at: string | null;
}

export interface CheckinRecord extends VisitTimestamps {
  id: string;
  first_name: string;
  last_name: string;
  appointment_at: string | null;
  service_name: string | null;
  practitioner_name: string | null;
  // The room they are (or were) in; null if none, or it was deleted.
  room_name: string | null;
  // That room's timer as it stands now — what the doctor does after
  // walking in is done on the room, not on the visit. Null with no room.
  room_timer: RoomTimer | null;
}

export type CheckinStatus =
  | "waiting"
  | "next_up"
  | "called"
  | "with_doctor"
  // The doctor has been in and the room is on its timer. These four are
  // the room's own statuses, under the names its tile shows
  // (room-status.ts): timer running / time up / well past time / needles
  // out and the room not yet marked ready.
  | "in_use"
  | "complete"
  | "overtime"
  | "turnover"
  // The doctor saw them and the room was marked ready.
  | "finished"
  // Taken off the board without having been seen (a no-show, a mistake).
  | "removed"
  // Never finished and too old to be on the board: nobody tapped "Room
  // ready", or they never got a room. (The board drops these by itself.)
  | "not_closed";

// roomTimer: the timer of the room the visit is in, when the caller
// knows it. Only a patient the doctor has seen follows it — someone
// lined up for the room, or called and still waiting, is not on that
// timer. Without it the answer stops at "with_doctor", as it did before
// the dashboard read timers.
export function checkinStatus(
  v: VisitTimestamps,
  nowMs: number,
  roomTimer?: RoomTimer | null
): CheckinStatus {
  if (v.done_at !== null) return v.seen_at !== null ? "finished" : "removed";
  if (nowMs - Date.parse(v.checked_in_at) > VISIT_ACTIVE_WINDOW_MS) {
    return "not_closed";
  }
  if (!v.room_id) return "waiting";
  if (v.called_at === null) return "next_up";
  if (v.seen_at === null) return "called";
  if (!roomTimer) return "with_doctor";
  // One occupant, already seen: the room's status with nobody waiting.
  const room = deriveRoomState(roomTimer, nowMs, 1, 0).status;
  return room === "in_use" ||
    room === "complete" ||
    room === "overtime" ||
    room === "turnover"
    ? room
    : "with_doctor";
}

// On the board right now.
export function isOpenStatus(status: CheckinStatus): boolean {
  return (
    status !== "finished" && status !== "removed" && status !== "not_closed"
  );
}

// In a room, called or further.
export function isInRoomStatus(status: CheckinStatus): boolean {
  return isOpenStatus(status) && status !== "waiting" && status !== "next_up";
}

// The next moment a status in the list changes with nobody touching
// anything: a running timer reaching zero, or time-up turning into
// overtime. Null if there is none. The list reads the clock once a
// minute; this is what lets it turn a pill when the timer actually ends.
export function nextStatusChangeMs(
  rows: (VisitTimestamps & { room_timer: RoomTimer | null })[],
  nowMs: number
): number | null {
  let next: number | null = null;
  for (const row of rows) {
    const timer = row.room_timer;
    const status = checkinStatus(row, nowMs, timer);
    if (status !== "in_use" && status !== "complete") continue;
    if (!timer?.timer_started_at || timer.timer_duration_seconds === null) {
      continue;
    }
    if (timer.timer_paused_at) continue;
    const endsMs =
      Date.parse(timer.timer_started_at) + timer.timer_duration_seconds * 1000;
    const at =
      status === "in_use" ? endsMs : endsMs + OVERTIME_GRACE_SECONDS * 1000;
    if (at > nowMs && (next === null || at < next)) next = at;
  }
  return next;
}

export function statusLabel(
  status: CheckinStatus,
  roomName: string | null
): string {
  const inRoom = (text: string) => (roomName ? `${text} · ${roomName}` : text);
  switch (status) {
    case "waiting":
      return "Waiting";
    case "next_up":
      return inRoom("Next up");
    case "called":
      return inRoom("Called");
    case "with_doctor":
      return inRoom("With doctor");
    case "in_use":
    case "complete":
    case "overtime":
    case "turnover":
      return inRoom(ROOM_STATUS_LABEL[status]);
    case "finished":
      return "Finished";
    case "removed":
      return "Removed";
    case "not_closed":
      return "Not closed";
  }
}

const minutesBetween = (fromIso: string, toIso: string) =>
  Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));

export interface VisitTimes {
  // Check-in until told to go to a room.
  waitForRoomMin: number | null;
  // In the room until the doctor came in.
  waitForDoctorMin: number | null;
  // Check-in until the room was marked ready — only for visits the doctor
  // saw (a removed no-show has no "visit length").
  visitMin: number | null;
}

export function visitTimes(v: VisitTimestamps): VisitTimes {
  return {
    waitForRoomMin: v.called_at
      ? minutesBetween(v.checked_in_at, v.called_at)
      : null,
    waitForDoctorMin:
      v.called_at && v.seen_at ? minutesBetween(v.called_at, v.seen_at) : null,
    visitMin:
      v.done_at && v.seen_at
        ? minutesBetween(v.checked_in_at, v.done_at)
        : null,
  };
}

// The middle value: half the visits were quicker, half slower. Used
// rather than the average because one forgotten "Room ready" (a visit
// "lasting" until the next morning) would drag an average far from what
// patients actually experienced.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface Measure {
  // How many visits the number is based on.
  count: number;
  median: number | null;
  longest: number | null;
}

function measure(values: number[]): Measure {
  return {
    count: values.length,
    median: median(values),
    longest: values.length ? Math.max(...values) : null,
  };
}

export interface VisitSummary {
  checkins: number;
  waitForRoom: Measure;
  waitForDoctor: Measure;
  visit: Measure;
}

export interface PractitionerSummary extends VisitSummary {
  // The Practice Better practitioner; null = no appointment that day.
  practitioner: string | null;
}

function summarize(rows: VisitTimestamps[]): VisitSummary {
  const times = rows.map(visitTimes);
  const present = (pick: (t: VisitTimes) => number | null) =>
    times.map(pick).filter((n): n is number => n !== null);
  return {
    checkins: rows.length,
    waitForRoom: measure(present((t) => t.waitForRoomMin)),
    waitForDoctor: measure(present((t) => t.waitForDoctorMin)),
    visit: measure(present((t) => t.visitMin)),
  };
}

// The numbers for a range of check-ins: all together, and per
// practitioner (most check-ins first; "no appointment" last).
export function summarizeVisits(
  rows: (VisitTimestamps & { practitioner_name: string | null })[]
): { all: VisitSummary; byPractitioner: PractitionerSummary[] } {
  const groups = new Map<string | null, VisitTimestamps[]>();
  for (const row of rows) {
    const key = row.practitioner_name?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const byPractitioner = [...groups.entries()]
    .map(([practitioner, group]) => ({ practitioner, ...summarize(group) }))
    .sort((a, b) =>
      a.practitioner === null
        ? 1
        : b.practitioner === null
          ? -1
          : b.checkins - a.checkins ||
            a.practitioner.localeCompare(b.practitioner)
    );
  return { all: summarize(rows), byPractitioner };
}

// One cell of a CSV file. A value that a spreadsheet would run as a
// formula (it starts with = + - or @) gets an apostrophe in front: names
// and service names come from outside, and "=HYPERLINK(...)" in a
// patient's name must open as text.
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const CHECKIN_CSV_HEADER = [
  "Checked in",
  "Patient",
  "Appointment",
  "Service",
  "Practitioner",
  "Room",
  "Status",
  "Called to room",
  "Doctor in",
  "Finished",
  "Wait for a room (min)",
  "Wait for the doctor (min)",
  "Whole visit (min)",
];

// The check-ins as a CSV file's text. formatWhen turns a timestamp into
// the date and time staff read (the browser's, so it is passed in). The
// leading BOM is what makes Excel read accented names correctly.
export function checkinsCsv(
  rows: CheckinRecord[],
  nowMs: number,
  formatWhen: (iso: string) => string
): string {
  const when = (iso: string | null) => (iso ? formatWhen(iso) : "");
  const lines = rows.map((r) => {
    const times = visitTimes(r);
    return [
      when(r.checked_in_at),
      `${r.first_name} ${r.last_name}`.trim(),
      when(r.appointment_at),
      r.service_name,
      r.practitioner_name,
      r.room_name,
      statusLabel(checkinStatus(r, nowMs, r.room_timer), null),
      when(r.called_at),
      when(r.seen_at),
      when(r.done_at),
      times.waitForRoomMin,
      times.waitForDoctorMin,
      times.visitMin,
    ]
      .map(csvCell)
      .join(",");
  });
  return (
    "﻿" + [CHECKIN_CSV_HEADER.map(csvCell).join(","), ...lines].join("\r\n")
  );
}
