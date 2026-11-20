import { describe, expect, it } from "vitest";
import {
  deriveRoomState,
  doctorColorClasses,
  formatTimerDisplay,
  pickDoctorColor,
  timerActionUpdate,
  DOCTOR_COLORS,
  OVERTIME_GRACE_SECONDS,
  RoomRow,
} from "./room-status";

const T0 = Date.parse("2026-08-03T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const baseRoom: RoomRow = {
  id: "r1",
  name: "Room 1",
  grid_row: 0,
  grid_col: 0,
  doctor_name: null,
  default_duration_seconds: 900,
  timer_started_at: null,
  timer_duration_seconds: null,
  timer_paused_at: null,
  capacity: 1,
  turnover_started_at: null,
  updated_at: iso(T0),
};

const running = (overrides: Partial<RoomRow> = {}): RoomRow => ({
  ...baseRoom,
  timer_started_at: iso(T0),
  timer_duration_seconds: 900,
  ...overrides,
});

describe("deriveRoomState", () => {
  it("is available when no timer is set", () => {
    expect(deriveRoomState(baseRoom, T0)).toEqual({
      status: "available",
      paused: false,
      remainingSeconds: null,
    });
  });

  it("is in_use with correct remaining while running", () => {
    const s = deriveRoomState(running(), T0 + 60_000);
    expect(s.status).toBe("in_use");
    expect(s.paused).toBe(false);
    expect(s.remainingSeconds).toBe(840);
  });

  it("is complete at exactly zero remaining", () => {
    const s = deriveRoomState(running(), T0 + 900_000);
    expect(s.status).toBe("complete");
    expect(s.remainingSeconds).toBe(0);
  });

  it("counts up (negative remaining) while complete", () => {
    const s = deriveRoomState(running(), T0 + 1_050_000);
    expect(s.status).toBe("complete");
    expect(s.remainingSeconds).toBe(-150);
  });

  it("escalates to overtime once past the grace period", () => {
    const s = deriveRoomState(
      running(),
      T0 + (900 + OVERTIME_GRACE_SECONDS) * 1000
    );
    expect(s.status).toBe("overtime");
  });

  it("freezes remaining while paused, regardless of now", () => {
    const room = running({ timer_paused_at: iso(T0 + 300_000) });
    const s = deriveRoomState(room, T0 + 3_600_000);
    expect(s.status).toBe("in_use");
    expect(s.paused).toBe(true);
    expect(s.remainingSeconds).toBe(600);
  });
});

describe("timerActionUpdate", () => {
  it("start uses the room default duration", () => {
    const r = timerActionUpdate(baseRoom, "start", T0);
    expect(r).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0),
        timer_duration_seconds: 900,
        timer_paused_at: null,
      },
    });
  });

  it("start fails when a session is already active", () => {
    expect(timerActionUpdate(running(), "start", T0 + 1000).ok).toBe(false);
  });

  it("pause stamps timer_paused_at", () => {
    const r = timerActionUpdate(running(), "pause", T0 + 60_000);
    expect(r).toEqual({
      ok: true,
      fields: { timer_paused_at: iso(T0 + 60_000) },
    });
  });

  it("pause fails once the timer has completed", () => {
    expect(timerActionUpdate(running(), "pause", T0 + 901_000).ok).toBe(false);
  });

  it("resume rewrites started_at preserving elapsed time", () => {
    const paused = running({ timer_paused_at: iso(T0 + 300_000) });
    const r = timerActionUpdate(paused, "resume", T0 + 500_000);
    expect(r).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0 + 200_000),
        timer_paused_at: null,
      },
    });
  });

  it("resume fails when not paused", () => {
    expect(timerActionUpdate(running(), "resume", T0).ok).toBe(false);
  });

  it("adjust on an available room edits the persisted default", () => {
    const r = timerActionUpdate(baseRoom, "adjust", T0, 60);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 960 } });
  });

  it("adjust clamps the default to the 60–3600 s range", () => {
    const short = { ...baseRoom, default_duration_seconds: 60 };
    const r = timerActionUpdate(short, "adjust", T0, -60);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 60 } });
  });

  it("adjust on a running room edits the session duration", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 60_000, 60);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 960 } });
  });

  it("adjust cannot push remaining below zero", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 880_000, -60);
    expect(r.ok).toBe(false);
  });

  it("adjust on a completed room can add time back (returns to in_use)", () => {
    const r = timerActionUpdate(running(), "adjust", T0 + 950_000, 120);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 1020 } });
  });

  it("adjust requires deltaSeconds", () => {
    expect(timerActionUpdate(baseRoom, "adjust", T0).ok).toBe(false);
  });

  it("set on an available room sets the persisted default", () => {
    const r = timerActionUpdate(baseRoom, "set", T0, 1200);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 1200 } });
  });

  it("set clamps to the 60-3600 s range", () => {
    const r = timerActionUpdate(baseRoom, "set", T0, 30);
    expect(r).toEqual({ ok: true, fields: { default_duration_seconds: 60 } });
  });

  it("set on a running room makes the value the new remaining time", () => {
    const r = timerActionUpdate(running(), "set", T0 + 300_000, 600);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 900 } });
  });

  it("set on a paused room uses the frozen elapsed time", () => {
    const paused = running({ timer_paused_at: iso(T0 + 120_000) });
    const r = timerActionUpdate(paused, "set", T0 + 900_000, 300);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 420 } });
  });

  it("set on a completed room brings it back to in_use remaining", () => {
    const r = timerActionUpdate(running(), "set", T0 + 950_000, 120);
    expect(r).toEqual({ ok: true, fields: { timer_duration_seconds: 1070 } });
  });

  it("set requires a value", () => {
    expect(timerActionUpdate(baseRoom, "set", T0).ok).toBe(false);
  });

  it("reset clears all session fields and leaves turnover alone", () => {
    const result = timerActionUpdate(running(), "reset", T0 + 1000);
    expect(result).toEqual({
      ok: true,
      fields: {
        timer_started_at: null,
        timer_duration_seconds: null,
        timer_paused_at: null,
      },
    });
  });

  it("clear ends the session and starts the room turning over", () => {
    const result = timerActionUpdate(running(), "clear", T0 + 1000);
    expect(result).toEqual({
      ok: true,
      fields: {
        timer_started_at: null,
        timer_duration_seconds: null,
        timer_paused_at: null,
        turnover_started_at: iso(T0 + 1000),
      },
    });
  });

  it("clear fails when no session is running", () => {
    expect(timerActionUpdate(baseRoom, "clear", T0).ok).toBe(false);
  });

  it("ready ends the turnover", () => {
    const turning = { ...baseRoom, turnover_started_at: iso(T0) };
    expect(timerActionUpdate(turning, "ready", T0 + 1000)).toEqual({
      ok: true,
      fields: { turnover_started_at: null },
    });
  });

  it("ready fails when the room is not turning over", () => {
    expect(timerActionUpdate(baseRoom, "ready", T0).ok).toBe(false);
    expect(timerActionUpdate(running(), "ready", T0).ok).toBe(false);
  });

  it("start on a room that is turning over ends the turnover too", () => {
    // The new tile only offers "Room ready" here, but a board still
    // running the previous version shows this room as free with a Start
    // button. Its Start must work, not dead-end on an error.
    const turning = { ...baseRoom, turnover_started_at: iso(T0) };
    expect(timerActionUpdate(turning, "start", T0 + 1000)).toEqual({
      ok: true,
      fields: {
        timer_started_at: iso(T0 + 1000),
        timer_duration_seconds: 900,
        timer_paused_at: null,
        turnover_started_at: null,
      },
    });
  });

  it("an ordinary start does not write the turnover column", () => {
    const result = timerActionUpdate(baseRoom, "start", T0);
    expect(result.ok && "turnover_started_at" in result.fields).toBe(false);
  });

  it("adjust and set edit the default while turning over", () => {
    const turning = { ...baseRoom, turnover_started_at: iso(T0) };
    expect(timerActionUpdate(turning, "adjust", T0, 60)).toEqual({
      ok: true,
      fields: { default_duration_seconds: 960 },
    });
    expect(timerActionUpdate(turning, "set", T0, 1200)).toEqual({
      ok: true,
      fields: { default_duration_seconds: 1200 },
    });
  });
});

describe("deriveRoomState with patients and turnover", () => {
  const idle = { status: undefined, paused: false, remainingSeconds: null };

  it("is patient_waiting when idle with an occupant", () => {
    expect(deriveRoomState(baseRoom, T0, 1)).toEqual({
      ...idle,
      status: "patient_waiting",
    });
  });

  it("stays available with no occupants (the default)", () => {
    expect(deriveRoomState(baseRoom, T0).status).toBe("available");
    expect(deriveRoomState(baseRoom, T0, 0).status).toBe("available");
  });

  it("is turnover once cleared, even with occupants still inside", () => {
    const turning = { ...baseRoom, turnover_started_at: iso(T0) };
    expect(deriveRoomState(turning, T0 + 1000, 2)).toEqual({
      ...idle,
      status: "turnover",
    });
  });

  it("a running timer wins over occupants and turnover", () => {
    const odd = running({ turnover_started_at: iso(T0) });
    expect(deriveRoomState(odd, T0 + 1000, 1).status).toBe("in_use");
  });
});

describe("pickDoctorColor", () => {
  it("picks the first palette color when none are used", () => {
    expect(pickDoctorColor([])).toBe(DOCTOR_COLORS[0]);
  });

  it("skips colors already in use", () => {
    expect(pickDoctorColor(["violet", "cyan"])).toBe("lime");
  });

  it("reuses a freed color in palette order", () => {
    expect(pickDoctorColor(["violet", "lime", "orange", "pink"])).toBe("cyan");
  });

  it("ignores null colors from unmigrated rows", () => {
    expect(pickDoctorColor([null, "violet"])).toBe("cyan");
  });
});

describe("doctorColorClasses", () => {
  it("maps every palette color to distinct classes", () => {
    const classes = DOCTOR_COLORS.map(doctorColorClasses);
    expect(new Set(classes).size).toBe(DOCTOR_COLORS.length);
  });

  it("falls back to neutral styling for unknown or missing colors", () => {
    expect(doctorColorClasses(null)).toBe("bg-white/10 text-white");
    expect(doctorColorClasses("plaid")).toBe("bg-white/10 text-white");
  });
});

describe("formatTimerDisplay", () => {
  it("formats minutes and seconds", () => {
    expect(formatTimerDisplay(900)).toBe("15:00");
    expect(formatTimerDisplay(59)).toBe("0:59");
    expect(formatTimerDisplay(0)).toBe("0:00");
  });

  it("formats negative values as count-up with a plus sign", () => {
    expect(formatTimerDisplay(-150)).toBe("+2:30");
  });
});
