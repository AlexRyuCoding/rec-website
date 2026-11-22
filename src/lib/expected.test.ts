import { describe, expect, it } from "vitest";
import {
  arrivalLabel,
  arrivalStatus,
  DaySession,
  expectedRows,
  parsePbSessions,
  scheduleIsStale,
  SCHEDULE_MIN_REFRESH_MS,
  SCHEDULE_TTL_MS,
} from "./expected";

// 23 November 2026 in the clinic (Los Angeles, UTC-8).
const DAY = "2026-11-23";
const local = (time: string) => `${DAY}T${time}:00-08:00`;
const utc = (time: string) => new Date(local(time)).toISOString();
const MIN = 60_000;

const pbSession = (o: Record<string, unknown> = {}) => ({
  id: "s1",
  sessionDate: local("10:30"),
  cancelled: false,
  clientRecord: {
    id: "pb-1",
    profile: { firstName: "Ann", lastName: "Licater" },
  },
  consultant: { profile: { firstName: "Alex", lastName: "Ryu" } },
  service: { name: "Acupuncture" },
  ...o,
});

describe("parsePbSessions", () => {
  it("keeps what the board needs — and not the patient's name", () => {
    const [session] = parsePbSessions([pbSession()], DAY);
    expect(session).toEqual({
      pbClientId: "pb-1",
      at: utc("10:30"),
      practitioner: "Alex Ryu",
      service: "Acupuncture",
    });
    expect(JSON.stringify(session)).not.toContain("Licater");
  });

  it("drops cancelled sessions", () => {
    expect(parsePbSessions([pbSession({ cancelled: true })], DAY)).toEqual([]);
  });

  it("drops sessions on another clinic day", () => {
    const lateLastNight = pbSession({
      sessionDate: "2026-11-22T23:30:00-08:00",
    });
    const tomorrow = pbSession({ sessionDate: "2026-11-24T00:15:00-08:00" });
    expect(parsePbSessions([lateLastNight, tomorrow], DAY)).toEqual([]);
  });

  it("counts a late-evening appointment as today, though it is tomorrow in UTC", () => {
    const evening = pbSession({ sessionDate: local("19:30") });
    expect(parsePbSessions([evening], DAY)).toHaveLength(1);
  });

  it("drops a session with no client record (a group class) or no time", () => {
    expect(
      parsePbSessions(
        [
          pbSession({ clientRecord: undefined }),
          pbSession({ clientRecord: {} }),
          pbSession({ sessionDate: undefined }),
          pbSession({ sessionDate: "not a date" }),
        ],
        DAY
      )
    ).toEqual([]);
  });

  it("survives fields that are missing or of another shape", () => {
    const sessions = parsePbSessions(
      [
        pbSession({ consultant: null, service: "Acupuncture" }),
        null,
        "nonsense",
        42,
      ],
      DAY
    );
    expect(sessions).toEqual([
      {
        pbClientId: "pb-1",
        at: utc("10:30"),
        practitioner: null,
        service: null,
      },
    ]);
  });

  it("is empty for a reply that is not a list", () => {
    expect(parsePbSessions(undefined, DAY)).toEqual([]);
    expect(parsePbSessions({ items: [] }, DAY)).toEqual([]);
  });

  it("sorts by time", () => {
    const sessions = parsePbSessions(
      [
        pbSession({
          sessionDate: local("14:00"),
          clientRecord: { id: "pb-2" },
        }),
        pbSession({
          sessionDate: local("09:00"),
          clientRecord: { id: "pb-3" },
        }),
      ],
      DAY
    );
    expect(sessions.map((s) => s.pbClientId)).toEqual(["pb-3", "pb-2"]);
  });
});

describe("arrival status and wording", () => {
  const at = utc("10:30");
  const now = (time: string) => Date.parse(local(time));

  it("is upcoming before the appointment", () => {
    expect(arrivalStatus(at, now("10:05"))).toBe("upcoming");
    expect(arrivalLabel(at, now("10:05"))).toBe("in 25 min");
    expect(arrivalLabel(at, now("08:55"))).toBe("in 1 h 35 min");
  });

  it("is due for the first ten minutes", () => {
    expect(arrivalStatus(at, now("10:30"))).toBe("due");
    expect(arrivalLabel(at, now("10:30"))).toBe("now");
    expect(arrivalStatus(at, now("10:39"))).toBe("due");
  });

  it("is late from ten minutes, very late from thirty", () => {
    expect(arrivalStatus(at, now("10:40"))).toBe("late");
    expect(arrivalLabel(at, now("10:42"))).toBe("12 min late");
    expect(arrivalStatus(at, now("11:00"))).toBe("very_late");
    expect(arrivalLabel(at, now("11:35"))).toBe("1 h 5 min late");
  });
});

describe("expectedRows", () => {
  const session = (pbClientId: string, time: string): DaySession => ({
    pbClientId,
    at: utc(time),
    practitioner: "Alex Ryu",
    service: "Acupuncture",
  });
  const patients = [
    { id: "p1", first_name: "Ann", last_name: "Licater", pb_client_id: "pb-1" },
    { id: "p2", first_name: "Bob", last_name: "Stone", pb_client_id: "pb-2" },
    { id: "p3", first_name: "Cy", last_name: "Diaz", pb_client_id: "pb-3" },
  ];

  it("lists who has not arrived, in order of time, as 'First L.'", () => {
    const sessions = [session("pb-2", "11:00"), session("pb-1", "09:30")];
    const { rows, unmatched } = expectedRows(sessions, patients, []);
    expect(rows).toEqual([
      {
        patientId: "p1",
        displayName: "Ann L.",
        at: utc("09:30"),
        practitioner: "Alex Ryu",
        service: "Acupuncture",
      },
      {
        patientId: "p2",
        displayName: "Bob S.",
        at: utc("11:00"),
        practitioner: "Alex Ryu",
        service: "Acupuncture",
      },
    ]);
    expect(unmatched).toBe(0);
    expect(JSON.stringify(rows)).not.toContain("Licater");
  });

  it("leaves out everyone who has checked in today", () => {
    const sessions = [session("pb-1", "09:30"), session("pb-2", "11:00")];
    expect(
      expectedRows(sessions, patients, ["p1"]).rows.map((r) => r.patientId)
    ).toEqual(["p2"]);
  });

  it("shows a patient with two appointments once, at the first", () => {
    const sessions = [session("pb-1", "14:00"), session("pb-1", "09:30")];
    const { rows } = expectedRows(sessions, patients, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].at).toBe(utc("09:30"));
  });

  it("counts appointments whose patient is not in our table, without listing them", () => {
    const sessions = [
      session("pb-1", "09:30"),
      session("pb-new", "10:00"),
      session("pb-new", "15:00"),
    ];
    const { rows, unmatched } = expectedRows(sessions, patients, []);
    expect(rows.map((r) => r.patientId)).toEqual(["p1"]);
    expect(unmatched).toBe(1);
  });

  it("is empty for an empty day", () => {
    expect(expectedRows([], patients, [])).toEqual({ rows: [], unmatched: 0 });
  });
});

describe("scheduleIsStale", () => {
  const NOW = Date.parse(local("10:00"));

  it("asks when nothing is held", () => {
    expect(scheduleIsStale(null, NOW, false)).toBe(true);
  });

  it("uses a copy for five minutes", () => {
    expect(SCHEDULE_TTL_MS).toBe(5 * MIN);
    expect(scheduleIsStale(NOW - 4 * MIN, NOW, false)).toBe(false);
    expect(scheduleIsStale(NOW - 5 * MIN, NOW, false)).toBe(true);
  });

  it("Refresh asks sooner, but not within thirty seconds", () => {
    expect(SCHEDULE_MIN_REFRESH_MS).toBe(30_000);
    expect(scheduleIsStale(NOW - 10_000, NOW, true)).toBe(false);
    expect(scheduleIsStale(NOW - 31_000, NOW, true)).toBe(true);
  });
});
