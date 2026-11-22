import { describe, expect, it } from "vitest";
import {
  DoctorWait,
  doorbellStep,
  effectiveDoctors,
  isLongWait,
  keptWaitingMs,
  LONG_WAIT_MS,
  REPEAT_MS,
  ringsOnThisTablet,
  RungAt,
  waitLevel,
  WAIT_LONG_MS,
  WAIT_WARN_MS,
} from "./alert-escalation";

const T0 = Date.parse("2026-11-23T18:00:00.000Z");
const MIN = 60_000;
const SEC = 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const wait = (
  visitId: string,
  doctorName: string | null = "Ryu",
  calledAtMs = T0
): DoctorWait => ({ visitId, doctorName, calledAtMs });

const EVERYONE: string[] = [];

// Walk a tablet through time, one check a second, and report when it rang
// (in whole seconds after T0).
function ringTimes(
  waitsAt: (nowMs: number) => DoctorWait[],
  myDoctors: string[],
  untilMs: number,
  startMs = T0
): number[] {
  let rungAt: RungAt = new Map();
  const rings: number[] = [];
  for (let now = startMs; now <= untilMs; now += SEC) {
    const step = doorbellStep(
      waitsAt(now),
      myDoctors,
      rungAt,
      now,
      now === startMs
    );
    rungAt = step.rungAt;
    if (step.ring) rings.push((now - T0) / SEC);
  }
  return rings;
}

describe("the ladder's constants", () => {
  it("a wait is long after five minutes, and then repeats every three", () => {
    expect(LONG_WAIT_MS).toBe(5 * MIN);
    expect(REPEAT_MS).toBe(3 * MIN);
    expect(isLongWait(T0, T0 + 5 * MIN - 1)).toBe(false);
    expect(isLongWait(T0, T0 + 5 * MIN)).toBe(true);
  });
});

describe("effectiveDoctors", () => {
  const roster = [{ name: "Ryu" }, { name: "Kim" }];

  it("keeps the doctors chosen", () => {
    expect(effectiveDoctors(["Kim"], roster)).toEqual(["Kim"]);
  });

  it("nothing chosen means everyone", () => {
    expect(effectiveDoctors([], roster)).toEqual([]);
  });

  it("a tablet set only to a doctor since removed rings for everyone", () => {
    expect(effectiveDoctors(["Lee"], roster)).toEqual([]);
    expect(effectiveDoctors(["Lee", "Kim"], roster)).toEqual(["Kim"]);
  });
});

describe("ringsOnThisTablet", () => {
  const justCalled = T0 + 10 * SEC;

  it("a tablet set to everyone rings for every doctor's patient", () => {
    expect(ringsOnThisTablet(wait("a", "Ryu"), EVERYONE, justCalled)).toBe(
      true
    );
  });

  it("a tablet set to a doctor rings for that doctor's patients only", () => {
    expect(ringsOnThisTablet(wait("a", "Ryu"), ["Ryu"], justCalled)).toBe(true);
    expect(ringsOnThisTablet(wait("a", "Ryu"), ["Kim"], justCalled)).toBe(
      false
    );
    expect(
      ringsOnThisTablet(wait("a", "Kim"), ["Ryu", "Kim"], justCalled)
    ).toBe(true);
  });

  it("a room with no doctor is everyone's", () => {
    expect(ringsOnThisTablet(wait("a", null), ["Kim"], justCalled)).toBe(true);
  });

  it("a long wait is everyone's, whoever the tablet is set to", () => {
    expect(ringsOnThisTablet(wait("a", "Ryu"), ["Kim"], T0 + 5 * MIN)).toBe(
      true
    );
  });
});

describe("doorbellStep", () => {
  // The patient is called at T0 + 10 s and nobody ever comes.
  const calledAt = T0 + 10 * SEC;
  const unanswered = (now: number) =>
    now >= calledAt ? [wait("a", "Ryu", calledAt)] : [];

  it("rings at the call, when the wait turns long, then every three minutes", () => {
    expect(ringTimes(unanswered, EVERYONE, T0 + 12 * MIN)).toEqual([
      10, // the call
      10 + 5 * 60, // long
      10 + 8 * 60,
      10 + 11 * 60,
    ]);
  });

  it("stops once the doctor is in", () => {
    const seenAfter6 = (now: number) =>
      now >= calledAt && now < calledAt + 6 * MIN
        ? [wait("a", "Ryu", calledAt)]
        : [];
    expect(ringTimes(seenAfter6, EVERYONE, T0 + 15 * MIN)).toEqual([10, 310]);
  });

  it("a doctor who comes within five minutes hears it once", () => {
    const seenAfter3 = (now: number) =>
      now >= calledAt && now < calledAt + 3 * MIN
        ? [wait("a", "Ryu", calledAt)]
        : [];
    expect(ringTimes(seenAfter3, EVERYONE, T0 + 15 * MIN)).toEqual([10]);
  });

  it("another doctor's tablet stays quiet until the wait is long, then joins in", () => {
    expect(ringTimes(unanswered, ["Kim"], T0 + 12 * MIN)).toEqual([
      310, // the long-wait mark is its first ring
      490,
      670,
    ]);
  });

  it("that doctor's own tablet rings from the call", () => {
    expect(ringTimes(unanswered, ["Ryu"], T0 + 6 * MIN)).toEqual([10, 310]);
  });

  it("a room with no doctor rings on a tablet set to someone", () => {
    const noDoctor = (now: number) =>
      now >= calledAt ? [wait("a", null, calledAt)] : [];
    expect(ringTimes(noDoctor, ["Kim"], T0 + 2 * MIN)).toEqual([10]);
  });

  it("two patients called at the same moment are one ring", () => {
    const couple = (now: number) =>
      now >= calledAt
        ? [wait("a", "Ryu", calledAt), wait("b", "Ryu", calledAt)]
        : [];
    expect(ringTimes(couple, EVERYONE, T0 + 2 * MIN)).toEqual([10]);
  });

  it("a second patient called later rings on arrival", () => {
    const second = calledAt + 2 * MIN;
    const two = (now: number) => [
      ...(now >= calledAt ? [wait("a", "Ryu", calledAt)] : []),
      ...(now >= second ? [wait("b", "Kim", second)] : []),
    ];
    expect(ringTimes(two, EVERYONE, T0 + 4 * MIN)).toEqual([10, 130]);
  });

  it("patients already waiting when the page loads do not ring at once…", () => {
    const alreadyWaiting = () => [wait("a", "Ryu", T0 - 2 * MIN)];
    expect(ringTimes(alreadyWaiting, EVERYONE, T0 + 2 * MIN)).toEqual([]);
  });

  it("…but a long wait rings three minutes after the page loaded", () => {
    const longAlready = () => [wait("a", "Ryu", T0 - 20 * MIN)];
    expect(ringTimes(longAlready, EVERYONE, T0 + 7 * MIN)).toEqual([180, 360]);
  });

  it("put back to waiting after a mistaken 'Doctor in' rings as new", () => {
    // called, "Doctor in" tapped at 1 min, undone at 2 min
    const undone = (now: number) =>
      (now >= calledAt && now < calledAt + MIN) || now >= calledAt + 2 * MIN
        ? [wait("a", "Ryu", calledAt)]
        : [];
    expect(ringTimes(undone, EVERYONE, T0 + 4 * MIN)).toEqual([10, 130]);
  });

  it("forgets patients who are no longer waiting", () => {
    const rungAt: RungAt = new Map([["gone", T0]]);
    expect(doorbellStep([], EVERYONE, rungAt, T0 + MIN).rungAt.size).toBe(0);
  });
});

describe("waiting-list colour", () => {
  const visit = (checkedInMin: number, appointmentMin: number | null) => ({
    checked_in_at: iso(T0 + checkedInMin * MIN),
    appointment_at:
      appointmentMin === null ? null : iso(T0 + appointmentMin * MIN),
  });

  it("counts from check-in when there is no appointment", () => {
    expect(keptWaitingMs(visit(0, null), T0 + 12 * MIN)).toBe(12 * MIN);
  });

  it("an early arrival is not 'kept waiting' until the appointment time", () => {
    // checked in at 0, appointment at 30
    expect(keptWaitingMs(visit(0, 30), T0 + 25 * MIN)).toBe(0);
    expect(waitLevel(visit(0, 30), T0 + 25 * MIN)).toBe("ok");
    expect(keptWaitingMs(visit(0, 30), T0 + 42 * MIN)).toBe(12 * MIN);
  });

  it("a late arrival counts from when they arrived", () => {
    // appointment at 0, checked in at 15
    expect(keptWaitingMs(visit(15, 0), T0 + 20 * MIN)).toBe(5 * MIN);
  });

  it("turns amber at ten minutes and red at twenty", () => {
    expect(WAIT_WARN_MS).toBe(10 * MIN);
    expect(WAIT_LONG_MS).toBe(20 * MIN);
    expect(waitLevel(visit(0, null), T0 + 10 * MIN - 1)).toBe("ok");
    expect(waitLevel(visit(0, null), T0 + 10 * MIN)).toBe("warn");
    expect(waitLevel(visit(0, null), T0 + 20 * MIN - 1)).toBe("warn");
    expect(waitLevel(visit(0, null), T0 + 20 * MIN)).toBe("long");
  });
});
