import { describe, expect, it } from "vitest";
import {
  deriveRoomState,
  formatTimerDisplay,
  timerActionUpdate,
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
  practitioner_name: null,
  default_duration_seconds: 900,
  timer_started_at: null,
  timer_duration_seconds: null,
  timer_paused_at: null,
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

  it.each(["reset", "clear"] as const)("%s clears all session fields", (a) => {
    const paused = running({ timer_paused_at: iso(T0 + 100_000) });
    expect(timerActionUpdate(paused, a, T0 + 200_000)).toEqual({
      ok: true,
      fields: {
        timer_started_at: null,
        timer_duration_seconds: null,
        timer_paused_at: null,
      },
    });
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
