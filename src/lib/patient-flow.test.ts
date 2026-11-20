import { describe, expect, it } from "vitest";
import {
  applyVisitUpdates,
  assignOutcome,
  assignUpdate,
  displayName,
  doctorForCalls,
  FlowRoom,
  FlowVisit,
  hasFreeBedNow,
  isActiveVisit,
  matchRosterDoctor,
  previewTimerFlow,
  promotionUpdates,
  removeUpdate,
  roomNextUp,
  roomOccupants,
  timerFlowUpdates,
  unassignUpdate,
  visitState,
  VisitView,
} from "./patient-flow";

const T0 = Date.parse("2026-11-19T18:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const visit = (overrides: Partial<FlowVisit> = {}): FlowVisit => ({
  id: "v1",
  checked_in_at: iso(T0 - 20 * MIN),
  practitioner_name: null,
  room_id: null,
  room_assigned_at: null,
  called_at: null,
  seen_at: null,
  done_at: null,
  ...overrides,
});

const room = (overrides: Partial<FlowRoom> = {}): FlowRoom => ({
  id: "r1",
  capacity: 1,
  timer_started_at: null,
  turnover_started_at: null,
  ...overrides,
});

// Visit builders, all for room r1 unless told otherwise.
const waiting = (id: string) => visit({ id });
const nextUp = (id: string, assignedMs = T0 - 5 * MIN, roomId = "r1") =>
  visit({ id, room_id: roomId, room_assigned_at: iso(assignedMs) });
const called = (id: string, roomId = "r1") =>
  visit({
    id,
    room_id: roomId,
    room_assigned_at: iso(T0 - 4 * MIN),
    called_at: iso(T0 - 4 * MIN),
  });
const treating = (id: string, roomId = "r1") =>
  visit({
    id,
    room_id: roomId,
    room_assigned_at: iso(T0 - 9 * MIN),
    called_at: iso(T0 - 9 * MIN),
    seen_at: iso(T0 - 6 * MIN),
  });

const timerRunning = { timer_started_at: iso(T0 - 6 * MIN) };

describe("displayName", () => {
  it("shows first name and last initial", () => {
    expect(displayName("Alex", "Ryu")).toBe("Alex R.");
  });
  it("trims and uppercases only the initial", () => {
    expect(displayName(" alex ", "ryu")).toBe("alex R.");
  });
  it("omits the initial when there is no last name", () => {
    expect(displayName("Alex", "")).toBe("Alex");
    expect(displayName("Alex", null)).toBe("Alex");
    expect(displayName("Alex", "   ")).toBe("Alex");
  });
  it("falls back to Guest without a first name", () => {
    expect(displayName(null, "Ryu")).toBe("Guest");
    expect(displayName("  ", undefined)).toBe("Guest");
  });
});

describe("isActiveVisit", () => {
  it("is false once the visit is done", () => {
    expect(isActiveVisit(visit({ done_at: iso(T0) }), T0)).toBe(false);
  });
  it("is true just inside the 12 hour window", () => {
    const v = visit({ checked_in_at: iso(T0 - (11 * HOUR + 59 * MIN)) });
    expect(isActiveVisit(v, T0)).toBe(true);
  });
  it("is false just past the 12 hour window", () => {
    const v = visit({ checked_in_at: iso(T0 - (12 * HOUR + MIN)) });
    expect(isActiveVisit(v, T0)).toBe(false);
  });
});

describe("visitState", () => {
  it("is waiting without a room", () => {
    expect(visitState(waiting("a"))).toBe("waiting");
  });
  it("is next_up when assigned but not called", () => {
    expect(visitState(nextUp("a"))).toBe("next_up");
  });
  it("is called once told to go", () => {
    expect(visitState(called("a"))).toBe("called");
  });
  it("is treating once the timer started", () => {
    expect(visitState(treating("a"))).toBe("treating");
  });
  it("is waiting when the room was deleted, whatever else is set", () => {
    expect(visitState({ ...treating("a"), room_id: null })).toBe("waiting");
  });
});

describe("roomOccupants / roomNextUp", () => {
  it("counts called and treating visits of that room only", () => {
    const visits = [
      called("a"),
      treating("b"),
      nextUp("c"),
      called("d", "r2"),
      waiting("e"),
    ];
    expect(roomOccupants(visits, "r1").map((v) => v.id)).toEqual(["a", "b"]);
  });
  it("orders the lined-up visits oldest assignment first", () => {
    const visits = [
      nextUp("late", T0 - MIN),
      nextUp("early", T0 - 9 * MIN),
      called("x"),
    ];
    expect(roomNextUp(visits, "r1").map((v) => v.id)).toEqual([
      "early",
      "late",
    ]);
  });
  it("a visit past the active window is not an occupant", () => {
    const stale = { ...called("old"), checked_in_at: iso(T0 - 13 * HOUR) };
    const active = [stale].filter((v) => isActiveVisit(v, T0));
    expect(roomOccupants(active, "r1")).toEqual([]);
  });
});

describe("hasFreeBedNow", () => {
  it("an idle empty room has a free bed", () => {
    expect(hasFreeBedNow(room(), [])).toBe(true);
  });
  it("an idle one-bed room with an occupant does not", () => {
    expect(hasFreeBedNow(room(), [called("a")])).toBe(false);
  });
  it("a hand-started timer with nobody tracked counts as busy", () => {
    expect(hasFreeBedNow(room(timerRunning), [])).toBe(false);
  });
  it("a late partner can join a two-bed room mid-treatment", () => {
    const r = room({ capacity: 2, ...timerRunning });
    expect(hasFreeBedNow(r, [treating("a")])).toBe(true);
  });
  it("but not when someone is already lined up for it", () => {
    const r = room({ capacity: 2, ...timerRunning });
    expect(hasFreeBedNow(r, [treating("a"), nextUp("n")])).toBe(false);
  });
  it("a room turning over is never free", () => {
    const r = room({ turnover_started_at: iso(T0 - MIN) });
    expect(hasFreeBedNow(r, [])).toBe(false);
  });
  it("an over-full room is not free", () => {
    expect(hasFreeBedNow(room(), [called("a"), called("b")])).toBe(false);
  });
  it("ignores people in other rooms", () => {
    expect(hasFreeBedNow(room(), [called("a", "r2")])).toBe(true);
  });
});

describe("assignOutcome", () => {
  it("sends to a free bed", () => {
    expect(assignOutcome(room(), [])).toBe("send");
  });
  it("lines up behind a busy room", () => {
    expect(assignOutcome(room(timerRunning), [treating("a")])).toBe("next_up");
  });
  it("is full once a one-bed room has someone lined up", () => {
    const visits = [treating("a"), nextUp("n")];
    expect(assignOutcome(room(timerRunning), visits)).toBe("full");
  });
  it("a two-bed room takes two in line", () => {
    const r = room({ capacity: 2, ...timerRunning });
    const visits = [treating("a"), treating("b"), nextUp("n")];
    expect(assignOutcome(r, visits)).toBe("next_up");
    expect(assignOutcome(r, [...visits, nextUp("m")])).toBe("full");
  });
});

describe("assignUpdate", () => {
  it("calls the patient straight away when a bed is free", () => {
    const result = assignUpdate(room(), [waiting("a")], "a", T0);
    expect(result).toEqual({
      ok: true,
      updates: [
        {
          id: "a",
          fields: {
            room_id: "r1",
            room_assigned_at: iso(T0),
            called_at: iso(T0),
            seen_at: null,
          },
        },
      ],
    });
  });
  it("lines the patient up when the room is busy", () => {
    const visits = [treating("t"), waiting("a")];
    const result = assignUpdate(room(timerRunning), visits, "a", T0);
    expect(result).toEqual({
      ok: true,
      updates: [
        {
          id: "a",
          fields: {
            room_id: "r1",
            room_assigned_at: iso(T0),
            called_at: null,
            seen_at: null,
          },
        },
      ],
    });
  });
  it("moves a patient already called in another room", () => {
    const result = assignUpdate(room(), [treating("a", "r2")], "a", T0);
    expect(result.ok && result.updates[0].fields).toEqual({
      room_id: "r1",
      room_assigned_at: iso(T0),
      called_at: iso(T0),
      seen_at: null,
    });
  });
  it("does not count the patient against the room they are already in", () => {
    // Re-assigning the sole occupant of a one-bed room to the same room
    // must not be refused as full.
    const result = assignUpdate(room(), [called("a")], "a", T0);
    expect(result.ok).toBe(true);
  });
  it("refuses a full room", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(assignUpdate(room(timerRunning), visits, "a", T0)).toEqual({
      ok: false,
      error: "That room already has patients lined up",
    });
  });
  it("refuses an unknown visit", () => {
    expect(assignUpdate(room(), [], "ghost", T0)).toEqual({
      ok: false,
      error: "Visit not found",
    });
  });
});

describe("promotionUpdates", () => {
  it("calls only as many as there are beds, oldest first", () => {
    const visits = [nextUp("late", T0 - MIN), nextUp("early", T0 - 9 * MIN)];
    expect(promotionUpdates(room(), visits, T0)).toEqual([
      { id: "early", fields: { called_at: iso(T0) } },
    ]);
  });
  it("fills both beds of a two-bed room", () => {
    const visits = [nextUp("b", T0 - MIN), nextUp("a", T0 - 9 * MIN)];
    const updates = promotionUpdates(room({ capacity: 2 }), visits, T0);
    expect(updates.map((u) => u.id)).toEqual(["a", "b"]);
  });
  it("calls nobody while a timer is running", () => {
    expect(promotionUpdates(room(timerRunning), [nextUp("a")], T0)).toEqual([]);
  });
  it("calls nobody while the room is turning over", () => {
    const r = room({ turnover_started_at: iso(T0 - MIN) });
    expect(promotionUpdates(r, [nextUp("a")], T0)).toEqual([]);
  });
  it("calls nobody into an over-full room", () => {
    const visits = [called("x"), called("y"), nextUp("a")];
    expect(promotionUpdates(room(), visits, T0)).toEqual([]);
  });
  it("calls the next patient after the occupant is removed", () => {
    const before = [called("x"), nextUp("a")];
    const after = applyVisitUpdates(before, [removeUpdate("x", T0)]).filter(
      (v) => isActiveVisit(v, T0)
    );
    expect(promotionUpdates(room(), after, T0)).toEqual([
      { id: "a", fields: { called_at: iso(T0) } },
    ]);
  });
  it("calls the next patient after the occupant goes back to the list", () => {
    const before = [called("x"), nextUp("a")];
    const after = applyVisitUpdates(before, [unassignUpdate("x")]);
    expect(after[0]).toMatchObject({
      room_id: null,
      room_assigned_at: null,
      called_at: null,
      seen_at: null,
    });
    expect(promotionUpdates(room(), after, T0).map((u) => u.id)).toEqual(["a"]);
  });
});

describe("timerFlowUpdates", () => {
  it("start marks called patients as seen and leaves the rest alone", () => {
    const visits = [called("a"), treating("b"), nextUp("n"), called("z", "r2")];
    expect(timerFlowUpdates("start", room(timerRunning), visits, T0)).toEqual([
      { id: "a", fields: { seen_at: iso(T0) } },
    ]);
  });
  it("ready finishes the occupants and calls whoever is lined up", () => {
    const visits = [treating("a"), nextUp("n")];
    expect(timerFlowUpdates("ready", room(), visits, T0)).toEqual([
      { id: "a", fields: { done_at: iso(T0) } },
      { id: "n", fields: { called_at: iso(T0) } },
    ]);
  });
  it("ready finishes both patients of a shared room", () => {
    const visits = [treating("a"), called("late")];
    const updates = timerFlowUpdates(
      "ready",
      room({ capacity: 2 }),
      visits,
      T0
    );
    expect(updates).toEqual([
      { id: "a", fields: { done_at: iso(T0) } },
      { id: "late", fields: { done_at: iso(T0) } },
    ]);
  });
  it("reset keeps the patient in the room, waiting again", () => {
    const visits = [treating("a"), nextUp("n")];
    expect(timerFlowUpdates("reset", room(), visits, T0)).toEqual([
      { id: "a", fields: { seen_at: null } },
    ]);
  });
  it("reset of a hand-started timer calls the lined-up patient", () => {
    expect(timerFlowUpdates("reset", room(), [nextUp("n")], T0)).toEqual([
      { id: "n", fields: { called_at: iso(T0) } },
    ]);
  });
  it("start on a room that was turning over finishes the old patients first", () => {
    // Start arriving during turnover (a board on the previous version)
    // means Room ready + Start: the people from the last session are
    // done, and whoever was lined up is the one now being treated.
    const visits = [treating("old"), nextUp("n")];
    const updates = timerFlowUpdates("start", room(timerRunning), visits, T0, {
      wasTurningOver: true,
    });
    const after = applyVisitUpdates(visits, updates);
    expect(after.find((v) => v.id === "old")?.done_at).toBe(iso(T0));
    expect(after.find((v) => v.id === "n")).toMatchObject({
      called_at: iso(T0),
      seen_at: iso(T0),
      done_at: null,
    });
  });

  it("other actions change no visits", () => {
    const visits = [called("a"), nextUp("n")];
    for (const action of ["pause", "resume", "adjust", "set", "clear"]) {
      expect(timerFlowUpdates(action, room(timerRunning), visits, T0)).toEqual(
        []
      );
    }
  });
});

describe("matchRosterDoctor", () => {
  const names = (...list: string[]) => list.map((name) => ({ name }));
  it("matches on last name, first name, or a titled full name", () => {
    expect(matchRosterDoctor("Alex Ryu", names("Ryu"))).toBe("Ryu");
    expect(matchRosterDoctor("Alex Ryu", names("Alex", "Kim"))).toBe("Alex");
    expect(matchRosterDoctor("Alex Ryu", names("Dr. Alex Ryu, L.Ac."))).toBe(
      "Dr. Alex Ryu, L.Ac."
    );
  });
  it("ignores case and titles on the Practice Better side too", () => {
    expect(matchRosterDoctor("DR. ALEX RYU DACM", names("alex ryu"))).toBe(
      "alex ryu"
    );
  });
  it("returns null when two roster doctors both fit", () => {
    expect(matchRosterDoctor("Alex Ryu", names("Ryu", "Alex Ryu"))).toBeNull();
  });
  it("returns null when nobody fits", () => {
    expect(matchRosterDoctor("Alex Ryu", names("Kim"))).toBeNull();
    expect(matchRosterDoctor("Alex Ryu", names("Sam Ryu"))).toBeNull();
  });
  it("returns null without a Practice Better name", () => {
    expect(matchRosterDoctor(null, names("Ryu"))).toBeNull();
    expect(matchRosterDoctor("", names("Ryu"))).toBeNull();
  });
  it("a roster entry that is only a title never matches", () => {
    expect(matchRosterDoctor("Alex Ryu", names("Dr."))).toBeNull();
  });
});

describe("doctorForCalls", () => {
  const roster = [{ name: "Ryu" }, { name: "Kim" }];
  it("is the roster doctor of the patient being called", () => {
    const visits = [visit({ id: "a", practitioner_name: "Jin Kim" })];
    const updates = [{ id: "a", fields: { called_at: iso(T0) } }];
    expect(doctorForCalls(updates, visits, roster)).toBe("Kim");
  });
  it("is null when nobody is being called", () => {
    const visits = [visit({ id: "a", practitioner_name: "Jin Kim" })];
    const updates = [{ id: "a", fields: { called_at: null, room_id: "r1" } }];
    expect(doctorForCalls(updates, visits, roster)).toBeNull();
    expect(doctorForCalls([], visits, roster)).toBeNull();
  });
  it("is null when the called patient's doctor is not on the roster", () => {
    const visits = [visit({ id: "a", practitioner_name: "Pat Lee" })];
    const updates = [{ id: "a", fields: { called_at: iso(T0) } }];
    expect(doctorForCalls(updates, visits, roster)).toBeNull();
  });
});

describe("previewTimerFlow", () => {
  const view = (v: FlowVisit, name: string): VisitView => ({
    id: v.id,
    display_name: name,
    appointment_at: null,
    checked_in_at: v.checked_in_at,
    practitioner_name: v.practitioner_name,
    room_id: v.room_id,
    room_assigned_at: v.room_assigned_at,
    called_at: v.called_at,
    seen_at: v.seen_at,
  });
  const views = [
    view(treating("a"), "Alex R."),
    view(nextUp("n"), "Nora K."),
    view(waiting("w"), "Wes T."),
  ];

  it("ready drops the finished patient and calls the next one", () => {
    const after = previewTimerFlow("ready", room(), views, T0);
    expect(after.map((v) => v.id)).toEqual(["n", "w"]);
    expect(after[0]).toMatchObject({
      display_name: "Nora K.",
      called_at: iso(T0),
    });
    expect(after[0]).not.toHaveProperty("done_at");
  });

  it("start marks the called patient as seen", () => {
    const calledViews = [view(called("a"), "Alex R.")];
    const after = previewTimerFlow(
      "start",
      room(timerRunning),
      calledViews,
      T0
    );
    expect(after[0].seen_at).toBe(iso(T0));
  });

  it("returns the same list when the action moves nobody", () => {
    expect(previewTimerFlow("pause", room(timerRunning), views, T0)).toBe(
      views
    );
  });
});
