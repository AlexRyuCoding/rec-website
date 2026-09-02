// Pure timer math for the room timer board. A running session is stored as
// timestamps + a duration; everything else (status, remaining, what a
// button press changes) is derived here so server routes and every client
// device agree without any ticking state.

export const OVERTIME_GRACE_SECONDS = 300;
export const ADJUST_STEP_SECONDS = 60;
export const MIN_DURATION_SECONDS = 60;
export const MAX_DURATION_SECONDS = 3600;
export const GRID_COLS = 6;
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
  updated_at: string;
}

export type RoomStatus = "available" | "in_use" | "complete" | "overtime";

export interface RoomState {
  status: RoomStatus;
  paused: boolean;
  // Seconds left; negative counts up past zero. Null when available.
  remainingSeconds: number | null;
}

function elapsedSeconds(room: RoomRow, nowMs: number): number {
  const startedMs = Date.parse(room.timer_started_at!);
  const effectiveNow = room.timer_paused_at
    ? Date.parse(room.timer_paused_at)
    : nowMs;
  return Math.floor((effectiveNow - startedMs) / 1000);
}

export function deriveRoomState(room: RoomRow, nowMs: number): RoomState {
  if (room.timer_started_at === null || room.timer_duration_seconds === null) {
    return { status: "available", paused: false, remainingSeconds: null };
  }
  const remaining = room.timer_duration_seconds - elapsedSeconds(room, nowMs);
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
  | "clear";

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

  switch (action) {
    case "start":
      if (state.status !== "available") {
        return { ok: false, error: "Timer already running" };
      }
      return {
        ok: true,
        fields: {
          timer_started_at: new Date(nowMs).toISOString(),
          timer_duration_seconds: room.default_duration_seconds,
          timer_paused_at: null,
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
      if (state.status === "available") {
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
      if (state.status === "available") {
        return { ok: true, fields: { default_duration_seconds: value } };
      }
      return {
        ok: true,
        fields: { timer_duration_seconds: elapsedSeconds(room, nowMs) + value },
      };
    }

    case "reset":
    case "clear":
      return {
        ok: true,
        fields: {
          timer_started_at: null,
          timer_duration_seconds: null,
          timer_paused_at: null,
        },
      };
  }
}

export function formatTimerDisplay(seconds: number): string {
  const sign = seconds < 0 ? "+" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}
