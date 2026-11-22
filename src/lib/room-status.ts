// Pure timer math for the room timer board. A running session is stored as
// timestamps + a duration; everything else (status, remaining, what a
// button press changes) is derived here so server routes and every client
// device agree without any ticking state.

export const OVERTIME_GRACE_SECONDS = 300;
export const ADJUST_STEP_SECONDS = 60;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 3600;
export const GRID_COLS = 6;
export const MAX_ROOM_CAPACITY = 4;
export const MAX_DOCTORS = 5;
export const DOCTOR_NAME_MAX_LENGTH = 60;

// One stable color per doctor. MAX_DOCTORS matches the palette size, so
// every doctor on the roster always holds a unique color.
export const DOCTOR_COLORS = [
  "violet",
  "cyan",
  "lime",
  "orange",
  "pink",
] as const;
export type DoctorColor = (typeof DOCTOR_COLORS)[number];

// Light background + very dark same-hue text stays legible on every tile
// status color. Tailwind only compiles literal class strings, hence a map.
const DOCTOR_COLOR_CLASSES: Record<DoctorColor, string> = {
  violet: "bg-violet-300 text-violet-950",
  cyan: "bg-cyan-300 text-cyan-950",
  lime: "bg-lime-300 text-lime-950",
  orange: "bg-orange-300 text-orange-950",
  pink: "bg-pink-300 text-pink-950",
};

export function doctorColorClasses(color: string | null | undefined): string {
  return DOCTOR_COLOR_CLASSES[color as DoctorColor] ?? "bg-white/10 text-white";
}

export function pickDoctorColor(usedColors: (string | null)[]): DoctorColor {
  return DOCTOR_COLORS.find((c) => !usedColors.includes(c)) ?? DOCTOR_COLORS[0];
}

export interface DoctorRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface RoomRow {
  id: string;
  name: string;
  grid_row: number;
  grid_col: number;
  doctor_name: string | null;
  default_duration_seconds: number;
  timer_started_at: string | null;
  timer_duration_seconds: number | null;
  timer_paused_at: string | null;
  // Beds. More than one means patients share the room on one timer.
  capacity: number;
  // Set by the check button ("needles out"); the tile then reads
  // "Setting Up". Cleared by "Room ready" or "Another session".
  turnover_started_at: string | null;
  updated_at: string;
}

export type RoomStatus =
  | "available"
  | "patient_waiting"
  | "with_doctor"
  | "turnover"
  | "in_use"
  | "complete"
  | "overtime";

export interface RoomState {
  status: RoomStatus;
  paused: boolean;
  // Seconds left; negative counts up past zero. Null when no timer runs.
  remainingSeconds: number | null;
}

function elapsedSeconds(room: RoomRow, nowMs: number): number {
  const startedMs = Date.parse(room.timer_started_at!);
  const effectiveNow = room.timer_paused_at
    ? Date.parse(room.timer_paused_at)
    : nowMs;
  return Math.floor((effectiveNow - startedMs) / 1000);
}

function timerIdle(room: RoomRow): boolean {
  return room.timer_started_at === null || room.timer_duration_seconds === null;
}

// occupantCount: patients called to or being treated in the room;
// waitingCount: how many of them the doctor has not seen yet (see
// patient-flow.ts). A running timer always wins; without one the room is
// setting up (cleared but not yet marked ready), waiting for the doctor
// (someone was sent in and nobody has come), with the doctor (the doctor
// is in but the needles are not, so no timer yet), or genuinely free.
// waitingCount defaults to "all of them" so a caller that only knows the
// room is occupied errs on the side of raising the alert.
export function deriveRoomState(
  room: RoomRow,
  nowMs: number,
  occupantCount = 0,
  waitingCount = occupantCount
): RoomState {
  if (timerIdle(room)) {
    const status = room.turnover_started_at
      ? "turnover"
      : waitingCount > 0
        ? "patient_waiting"
        : occupantCount > 0
          ? "with_doctor"
          : "available";
    return { status, paused: false, remainingSeconds: null };
  }
  const remaining = room.timer_duration_seconds! - elapsedSeconds(room, nowMs);
  if (remaining > 0) {
    return {
      status: "in_use",
      paused: room.timer_paused_at !== null,
      remainingSeconds: remaining,
    };
  }
  return {
    status: remaining > -OVERTIME_GRACE_SECONDS ? "complete" : "overtime",
    paused: false,
    remainingSeconds: remaining,
  };
}

export type TimerAction =
  | "start"
  | "pause"
  | "resume"
  | "reset"
  | "adjust"
  | "set"
  | "clear"
  | "ready"
  | "again";

export type TimerUpdate =
  | { ok: true; fields: Partial<RoomRow> }
  | { ok: false; error: string };

const clampDuration = (s: number) =>
  Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, s));

// valueSeconds: for "adjust" it is the signed delta; for "set" it is the
// absolute value typed by staff — the new default on an available room, or
// the new remaining time on an active session.
export function timerActionUpdate(
  room: RoomRow,
  action: TimerAction,
  nowMs: number,
  valueSeconds?: number
): TimerUpdate {
  const state = deriveRoomState(room, nowMs);
  const idle = timerIdle(room);

  switch (action) {
    case "start":
      if (!idle) {
        return { ok: false, error: "Timer already running" };
      }
      // Starting during turnover means "Room ready" and Start in one.
      // The tile only offers "Room ready" in that state, but a board
      // still running an older version of the page shows the room as
      // free with a Start button — that Start has to work. The patient
      // side of it is in patient-flow.ts (timerFlowUpdates).
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs).toISOString(),
          timer_duration_seconds: room.default_duration_seconds,
          timer_paused_at: null,
          ...(room.turnover_started_at ? { turnover_started_at: null } : {}),
        },
      };

    case "pause":
      if (state.status !== "in_use" || state.paused) {
        return { ok: false, error: "No running timer to pause" };
      }
      return {
        ok: true,
        fields: { timer_paused_at: new Date(nowMs).toISOString() },
      };

    case "resume": {
      if (state.status !== "in_use" || !state.paused) {
        return { ok: false, error: "Timer is not paused" };
      }
      const elapsedMs =
        Date.parse(room.timer_paused_at!) - Date.parse(room.timer_started_at!);
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs - elapsedMs).toISOString(),
          timer_paused_at: null,
        },
      };
    }

    case "adjust": {
      if (valueSeconds === undefined || valueSeconds === 0) {
        return { ok: false, error: "deltaSeconds required" };
      }
      if (idle) {
        return {
          ok: true,
          fields: {
            default_duration_seconds: clampDuration(
              room.default_duration_seconds + valueSeconds
            ),
          },
        };
      }
      const next = Math.min(
        room.timer_duration_seconds! + valueSeconds,
        MAX_DURATION_SECONDS
      );
      if (next < elapsedSeconds(room, nowMs)) {
        return { ok: false, error: "Cannot reduce below elapsed time" };
      }
      return { ok: true, fields: { timer_duration_seconds: next } };
    }

    case "set": {
      if (valueSeconds === undefined) {
        return { ok: false, error: "setSeconds required" };
      }
      const value = clampDuration(valueSeconds);
      if (idle) {
        return { ok: true, fields: { default_duration_seconds: value } };
      }
      return {
        ok: true,
        fields: { timer_duration_seconds: elapsedSeconds(room, nowMs) + value },
      };
    }

    // Abandon the session (the timer was a mistake). The room does not
    // go to Setting Up: nobody was treated.
    case "reset":
      return {
        ok: true,
        fields: {
          timer_started_at: null,
          timer_duration_seconds: null,
          timer_paused_at: null,
        },
      };

    // Staff tap the check when they go in to remove needles, so the
    // patient is still in the room: the alarm stops and the room is
    // "Setting Up" until someone taps "Room ready" or "Another session".
    case "clear":
      if (idle) {
        return { ok: false, error: "No session to clear" };
      }
      return {
        ok: true,
        fields: {
          timer_started_at: null,
          timer_duration_seconds: null,
          timer_paused_at: null,
          turnover_started_at: new Date(nowMs).toISOString(),
        },
      };

    case "ready":
      if (!idle || !room.turnover_started_at) {
        return { ok: false, error: "Room is not setting up" };
      }
      return { ok: true, fields: { turnover_started_at: null } };

    // "Another session": the same patients stay for one more timed
    // session (fire cupping is two in a row; or a second service). The
    // doctor silenced the alarm with the check, set up the next session
    // in the room, and starts the timer on the way out. Unlike Start it
    // is only offered from there, so it can never be mistaken for "Room
    // ready + Start" — the patient side is in patient-flow.ts.
    case "again":
      if (!idle || !room.turnover_started_at) {
        return { ok: false, error: "Room is not setting up" };
      }
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs).toISOString(),
          timer_duration_seconds: room.default_duration_seconds,
          timer_paused_at: null,
          turnover_started_at: null,
        },
      };
  }
}

// What the tile's "type a time" box means when staff are done with it:
// the seconds to set, or null to change nothing.
//
// Leaving the box (a tap elsewhere) must never change a timer by itself.
// The box opens showing the time rounded to whole minutes, so committing
// it untouched would turn a running 12:34 into 13:00; and an emptied box
// is not "one minute". Only Enter on a number, or leaving after typing a
// different number, sets anything.
export function typedMinutesToSeconds(
  text: string,
  openedWith: string,
  how: "enter" | "leave"
): number | null {
  const typed = text.trim();
  if (typed === "") return null;
  if (how === "leave" && typed === openedWith.trim()) return null;
  const minutes = Number(typed);
  if (!Number.isFinite(minutes)) return null;
  return clampDuration(Math.round(minutes) * 60);
}

export function formatTimerDisplay(seconds: number): string {
  const sign = seconds < 0 ? "+" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}
