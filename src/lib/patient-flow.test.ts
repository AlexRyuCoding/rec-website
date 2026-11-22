import { describe, expect, it } from "vitest";
import {
  assignCollision,
  firstVisitCandidates,
  firstVisitIds,
  NEW_PATIENT_WINDOW_MS,
  restoreTarget,
  restoreUpdate,
  roomDeleteBlocker,
  applyVisitUpdates,
  assignCompanions,
  AssignOutcome,
  assignOutcome,
  assignUpdate,
  displayName,
  doctorForCalls,
  doctorInUpdates,
  FlowRoom,
  FlowVisit,
  isActiveVisit,
  joinQuestionFor,
  joinQuestionOpen,
  markWaitingUpdate,
  matchRosterDoctor,
  previewTimerFlow,
  promotionUpdates,
  removeUpdate,
  roomNextUp,
  roomOccupants,
  roomWaitingForDoctor,
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
const settingUp = { turnover_started_at: iso(T0 - MIN) };
const two = (o: Partial<FlowRoom> = {}) => room({ capacity: 2, ...o });
const named = (o: Partial<FlowRoom> = {}) => room({ name: "Room 5", ...o });
const fieldsOf = (r: ReturnType<typeof assignUpdate>) =>
  r.ok ? r.updates[0].fields : r;

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

describe("assignOutcome", () => {
  it.each<[string, FlowRoom, FlowVisit[], AssignOutcome]>([
    // one bed — exactly as before
    ["empty one-bed room", room(), [], "send"],
    [
      "one-bed room, patient waiting for the doctor",
      room(),
      [called("a")],
      "next_up",
    ],
    [
      "one-bed room mid-treatment",
      room(timerRunning),
      [treating("a")],
      "next_up",
    ],
    [
      "one-bed room with a line",
      room(timerRunning),
      [treating("a"), nextUp("n")],
      "full",
    ],
    ["hand-started timer, nobody tracked", room(timerRunning), [], "next_up"],
    ["one-bed room setting up", room(settingUp), [], "next_up"],
    ["over-full one-bed room", room(), [called("a"), called("b")], "next_up"],
    ["people in other rooms do not count", room(), [called("a", "r2")], "send"],
    // two beds
    ["empty two-bed room", two(), [], "send"],
    [
      "two beds, one patient waiting for the doctor",
      two(),
      [called("a")],
      "ask_join_room",
    ],
    [
      "two beds, one patient mid-treatment",
      two(timerRunning),
      [treating("a")],
      "ask_join_room",
    ],
    [
      "two beds, both taken",
      two(timerRunning),
      [treating("a"), treating("b")],
      "next_up",
    ],
    [
      "two beds, hand-started timer, nobody tracked",
      two(timerRunning),
      [],
      "next_up",
    ],
    [
      "two beds setting up, spare bed, no line",
      two(settingUp),
      [treating("a")],
      "next_up",
    ],
    [
      "two beds, one in line",
      two(timerRunning),
      [treating("a"), nextUp("n")],
      "ask_join_line",
    ],
    [
      "a line wins over setting up",
      two(settingUp),
      [treating("a"), nextUp("n")],
      "ask_join_line",
    ],
    ["a line wins over an empty room", two(), [nextUp("n")], "ask_join_line"],
    [
      "two beds, line of two",
      two(timerRunning),
      [treating("a"), nextUp("n"), nextUp("m")],
      "full",
    ],
  ])("%s", (_name, r, visits, expected) => {
    expect(assignOutcome(r, visits)).toBe(expected);
  });
});

describe("assignCompanions", () => {
  it("is the occupants when the question is about the room", () => {
    const visits = [treating("a"), called("b", "r2")];
    expect(
      assignCompanions(two(timerRunning), visits).map((v) => v.id)
    ).toEqual(["a"]);
  });
  it("is the line, oldest first, when the question is about the line", () => {
    const r = room({ capacity: 3, ...timerRunning });
    const visits = [
      treating("a"),
      nextUp("late", T0 - MIN),
      nextUp("early", T0 - 9 * MIN),
    ];
    expect(assignCompanions(r, visits).map((v) => v.id)).toEqual([
      "early",
      "late",
    ]);
  });
  it("is nobody when there is nothing to ask", () => {
    expect(assignCompanions(two(), [])).toEqual([]);
    expect(assignCompanions(room(), [called("a")])).toEqual([]);
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
  // The board only ever assigns from the waiting list, so an assign for
  // a patient who already has a room can only come from a board whose
  // picture is out of date. Moving them would free the room they are
  // physically in — and call whoever is lined up for it in on them.
  it("refuses a patient who is already in a room", () => {
    expect(assignUpdate(room(), [treating("a", "r2")], "a", T0)).toEqual({
      ok: false,
      error: "That patient already has a room — please choose again",
    });
    expect(assignUpdate(room(), [called("a")], "a", T0).ok).toBe(false);
  });
  it("refuses a patient who is already lined up for a room", () => {
    const visits = [treating("t", "r2"), nextUp("a", T0 - 5 * MIN, "r2")];
    expect(assignUpdate(room(), visits, "a", T0)).toEqual({
      ok: false,
      error: "That patient already has a room — please choose again",
    });
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

  const lined = {
    room_id: "r1",
    room_assigned_at: iso(T0),
    called_at: null,
    seen_at: null,
  };
  const sent = { ...lined, called_at: iso(T0) };
  const CHANGED = {
    ok: false,
    error: "Room 5 changed — please choose again",
  };

  it("absent: an occupied shared room lines the patient up", () => {
    const visits = [called("x"), waiting("a")];
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0))).toEqual(lined);
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0, []))).toEqual(lined);
  });
  it("a yes naming the occupants sends the patient in", () => {
    const visits = [called("x"), waiting("a")];
    expect(fieldsOf(assignUpdate(two(), visits, "a", T0, ["x"]))).toEqual(sent);
  });
  it("a yes names every occupant, in any order", () => {
    const r = room({ capacity: 3 });
    const visits = [called("x"), called("y"), waiting("a")];
    expect(fieldsOf(assignUpdate(r, visits, "a", T0, ["y", "x"]))).toEqual(
      sent
    );
  });
  it("partial match: a yes naming one of two occupants is refused", () => {
    const r = named({ capacity: 3 });
    const visits = [called("x"), called("y"), waiting("a")];
    expect(assignUpdate(r, visits, "a", T0, ["x"])).toEqual(CHANGED);
  });
  it("a yes naming the line joins the line", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(
      fieldsOf(assignUpdate(two(timerRunning), visits, "a", T0, ["n"]))
    ).toEqual(lined);
  });
  it("no answer on a room with a line is refused, by name", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(
      assignUpdate(named({ capacity: 2, ...timerRunning }), visits, "a", T0)
    ).toEqual({
      ok: false,
      error: "Room 5 already has someone waiting for it",
    });
    expect(assignUpdate(two(timerRunning), visits, "a", T0)).toEqual({
      ok: false,
      error: "That room already has someone waiting for it",
    });
  });
  it.each<[string, FlowRoom, FlowVisit[], string[]]>([
    [
      "a line appeared behind the room",
      named({ capacity: 2 }),
      [called("x"), nextUp("n")],
      ["x"],
    ],
    ["the line it named is gone", named({ capacity: 2 }), [called("x")], ["n"]],
    ["the occupant was replaced", named({ capacity: 2 }), [called("y")], ["x"]],
    ["room emptied", named({ capacity: 2 }), [], ["x"]],
    [
      "the room filled up",
      named({ capacity: 2, ...timerRunning }),
      [treating("x"), treating("y")],
      ["x"],
    ],
    [
      "it names someone in another room",
      named({ capacity: 2 }),
      [called("x"), called("z", "r2")],
      ["z"],
    ],
  ])("a stale yes is refused: %s", (_name, r, others, togetherWith) => {
    const visits = [...others, waiting("a")];
    expect(assignUpdate(r, visits, "a", T0, togetherWith)).toEqual(CHANGED);
  });
});

describe("promotionUpdates", () => {
  it("calls only as many as there are beds, oldest first", () => {
    const visits = [nextUp("late", T0 - MIN), nextUp("early", T0 - 9 * MIN)];
    expect(promotionUpdates(room(), visits, T0)).toEqual([
      { id: "early", fields: { called_at: iso(T0) } },
    ]);
  });
  it("calls the whole line of an empty two-bed room, oldest first", () => {
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
  it("calls nobody while anyone is still in a shared room", () => {
    expect(promotionUpdates(two(), [treating("x"), nextUp("a")], T0)).toEqual(
      []
    );
  });
  it("calls a waiting couple together once the last occupant has left", () => {
    const before = [
      treating("x"),
      treating("y"),
      nextUp("a", T0 - 9 * MIN),
      nextUp("b", T0 - MIN),
    ];
    const oneLeft = applyVisitUpdates(before, [removeUpdate("x", T0)]).filter(
      (v) => v.done_at === null
    );
    expect(promotionUpdates(two(), oneLeft, T0)).toEqual([]);
    const empty = applyVisitUpdates(oneLeft, [removeUpdate("y", T0)]).filter(
      (v) => v.done_at === null
    );
    expect(promotionUpdates(two(), empty, T0).map((u) => u.id)).toEqual([
      "a",
      "b",
    ]);
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
  it("reset keeps the patient in the room, still with the doctor", () => {
    // Whoever started the timer was in the room. Cancelling it must not
    // throw the room back to "Patient waiting" and re-raise the alert.
    const visits = [treating("a"), nextUp("n")];
    expect(timerFlowUpdates("reset", room(), visits, T0)).toEqual([]);
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

  it("again finishes nobody and calls nobody, with or without the route's flag", () => {
    const visits = [treating("x"), nextUp("a")];
    expect(timerFlowUpdates("again", room(timerRunning), visits, T0)).toEqual(
      []
    );
    expect(
      timerFlowUpdates("again", room(timerRunning), visits, T0, {
        wasTurningOver: true,
      })
    ).toEqual([]);
  });
  it("again marks a late partner as seen, like start", () => {
    const visits = [treating("x"), called("y")];
    expect(timerFlowUpdates("again", two(timerRunning), visits, T0)).toEqual([
      { id: "y", fields: { seen_at: iso(T0) } },
    ]);
  });
  it("a line kept through another session is still called by room ready", () => {
    const visits = [treating("x"), nextUp("a")];
    const afterAgain = applyVisitUpdates(
      visits,
      timerFlowUpdates("again", room(timerRunning), visits, T0)
    );
    const updates = timerFlowUpdates("ready", room(), afterAgain, T0);
    expect(updates).toEqual([
      { id: "x", fields: { done_at: iso(T0) } },
      { id: "a", fields: { called_at: iso(T0) } },
    ]);
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
    service_name: null,
    first_visit: false,
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

describe("doctor in / still waiting", () => {
  it("roomWaitingForDoctor is the called patients nobody has seen yet", () => {
    const visits = [called("a"), treating("b"), nextUp("n"), called("z", "r2")];
    expect(roomWaitingForDoctor(visits, "r1").map((v) => v.id)).toEqual(["a"]);
  });

  it("doctor in marks every waiting patient in the room as seen", () => {
    const visits = [called("a"), called("b"), treating("c"), nextUp("n")];
    expect(doctorInUpdates("r1", visits, T0)).toEqual([
      { id: "a", fields: { seen_at: iso(T0) } },
      { id: "b", fields: { seen_at: iso(T0) } },
    ]);
  });

  it("doctor in leaves other rooms and lined-up patients alone", () => {
    const visits = [called("z", "r2"), nextUp("n")];
    expect(doctorInUpdates("r1", visits, T0)).toEqual([]);
  });

  it("a mistaken 'doctor in' can be undone for one patient", () => {
    const after = applyVisitUpdates([treating("a")], [markWaitingUpdate("a")]);
    expect(after[0].seen_at).toBeNull();
    expect(after[0].called_at).not.toBeNull();
    expect(roomWaitingForDoctor(after, "r1").map((v) => v.id)).toEqual(["a"]);
  });
});

describe("join question", () => {
  const rooms = [two({ id: "r1" })];
  it("asks about the occupants of a shared room with a spare bed", () => {
    expect(joinQuestionFor(two(), [called("x"), waiting("a")], "a")).toEqual({
      visitId: "a",
      roomId: "r1",
      kind: "ask_join_room",
      companionIds: ["x"],
    });
  });
  it("asks about the line when the room has one", () => {
    const visits = [treating("t"), nextUp("n"), waiting("a")];
    expect(joinQuestionFor(two(timerRunning), visits, "a")).toMatchObject({
      kind: "ask_join_line",
      companionIds: ["n"],
    });
  });
  it("is null when there is nothing to ask", () => {
    expect(joinQuestionFor(two(), [waiting("a")], "a")).toBeNull();
    expect(
      joinQuestionFor(room(), [called("x"), waiting("a")], "a")
    ).toBeNull();
  });
  it("stays open while nothing changed", () => {
    const visits = [called("x"), waiting("a")];
    const q = joinQuestionFor(rooms[0], visits, "a")!;
    expect(joinQuestionOpen(q, rooms, visits)).toBe(true);
  });
  it.each<[string, FlowRoom[], FlowVisit[]]>([
    ["the occupant was replaced", rooms, [called("y"), waiting("a")]],
    [
      "a second occupant joined",
      [room({ capacity: 3 })],
      [called("x"), called("y"), waiting("a")],
    ],
    ["a line appeared", rooms, [called("x"), nextUp("n"), waiting("a")]],
    ["the room emptied", rooms, [waiting("a")]],
    ["the room was deleted", [], [called("x"), waiting("a")]],
    [
      "the patient got a room elsewhere",
      rooms,
      [called("x"), called("a", "r2")],
    ],
    ["the patient left the board", rooms, [called("x")]],
  ])("closes when %s", (_name, roomsNow, visitsNow) => {
    const q = joinQuestionFor(rooms[0], [called("x"), waiting("a")], "a")!;
    expect(joinQuestionOpen(q, roomsNow, visitsNow)).toBe(false);
  });
});

describe("assignCollision (two boards assigning at the same instant)", () => {
  it("a patient alone in the room they were sent to is fine", () => {
    expect(assignCollision("r1", [called("a")], "a")).toBe(false);
  });

  it("two patients each sent to the same empty room collide", () => {
    const after = [called("a"), called("b")];
    expect(assignCollision("r1", after, "a")).toBe(true);
    expect(assignCollision("r1", after, "b")).toBe(true);
  });

  it("the people the answer named are not a collision", () => {
    const after = [treating("a"), called("b")];
    expect(assignCollision("r1", after, "b", ["a"])).toBe(false);
  });

  it("someone the answer did not name is a collision, named ones or not", () => {
    const after = [treating("a"), called("b"), called("c")];
    expect(assignCollision("r1", after, "b", ["a"])).toBe(true);
  });

  it("two patients each lined up alone for the same room collide", () => {
    const after = [treating("x"), nextUp("a"), nextUp("b", T0 - MIN)];
    expect(assignCollision("r1", after, "a")).toBe(true);
    expect(assignCollision("r1", after, "b")).toBe(true);
  });

  it("joining the line with the people named is fine", () => {
    const after = [treating("x"), nextUp("a"), nextUp("b", T0 - MIN)];
    expect(assignCollision("r1", after, "b", ["a"])).toBe(false);
  });

  it("being lined up behind the people in the room is not a collision", () => {
    expect(assignCollision("r1", [treating("x"), nextUp("a")], "a")).toBe(
      false
    );
  });

  it("people in other rooms, and people still waiting, do not count", () => {
    const after = [called("a"), called("b", "r2"), waiting("c")];
    expect(assignCollision("r1", after, "a")).toBe(false);
  });

  it("nothing to take back if the patient is no longer in that room", () => {
    expect(assignCollision("r1", [waiting("a"), called("b")], "a")).toBe(false);
    expect(assignCollision("r1", [called("b")], "a")).toBe(false);
  });
});

describe("roomDeleteBlocker", () => {
  const idle = named();

  it("an empty, idle room can be deleted", () => {
    expect(
      roomDeleteBlocker(idle, [waiting("a"), called("b", "r2")])
    ).toBeNull();
  });

  it("refuses while a patient is in the room", () => {
    expect(roomDeleteBlocker(idle, [called("a")])).toBe(
      "Room 5 has patients — finish or move them first"
    );
  });

  it("refuses while a patient is lined up for it", () => {
    expect(roomDeleteBlocker(idle, [nextUp("a")])).toContain("has patients");
  });

  it("refuses while its timer runs, even with nobody tracked in it", () => {
    expect(roomDeleteBlocker(named(timerRunning), [])).toBe(
      "Room 5 has a timer running — clear it first"
    );
  });

  it("refuses while it is setting up", () => {
    expect(roomDeleteBlocker(named(settingUp), [])).toContain("setting up");
  });
});

describe("first visit", () => {
  const DAY = 24 * HOUR;
  const v = (
    id: string,
    patientId: string | null,
    recordAgeDays: number | null,
    checkedInMs = T0 - 10 * MIN
  ) => ({
    id,
    patient_id: patientId,
    checked_in_at: iso(checkedInMs),
    patient_created_at:
      recordAgeDays === null ? null : iso(T0 - recordAgeDays * DAY),
  });

  it("only patients with a recent record are looked up at all", () => {
    const visits = [v("a", "p1", 3), v("b", "p2", 400), v("c", "p3", null)];
    expect(firstVisitCandidates(visits, T0)).toEqual(["p1"]);
    expect(NEW_PATIENT_WINDOW_MS).toBe(60 * DAY);
  });

  it("a new record and no earlier check-in is a first visit", () => {
    const visits = [v("a", "p1", 3)];
    const history = [
      { patient_id: "p1", checked_in_at: visits[0].checked_in_at },
    ];
    expect([...firstVisitIds(visits, history, T0)]).toEqual(["a"]);
  });

  it("a new record but an earlier check-in is not", () => {
    const visits = [v("a", "p1", 10)];
    const history = [
      { patient_id: "p1", checked_in_at: iso(T0 - 7 * DAY) },
      { patient_id: "p1", checked_in_at: visits[0].checked_in_at },
    ];
    expect(firstVisitIds(visits, history, T0).size).toBe(0);
  });

  it("a patient of many years using the kiosk for the first time is not", () => {
    // Their record is old; the check-in log just does not go back that far.
    expect(firstVisitIds([v("a", "p1", 900)], [], T0).size).toBe(0);
  });

  it("someone else's earlier check-in does not count against them", () => {
    const visits = [v("a", "p1", 3)];
    const history = [{ patient_id: "p2", checked_in_at: iso(T0 - 7 * DAY) }];
    expect(firstVisitIds(visits, history, T0).has("a")).toBe(true);
  });

  it("a second visit the same day is no longer the first", () => {
    const morning = v("a", "p1", 3, T0 - 5 * HOUR);
    const afternoon = v("b", "p1", 3, T0 - 10 * MIN);
    const history = [morning, afternoon].map((x) => ({
      patient_id: "p1",
      checked_in_at: x.checked_in_at,
    }));
    expect([...firstVisitIds([morning, afternoon], history, T0)]).toEqual([
      "a",
    ]);
  });

  it("anything unknown is not a first visit", () => {
    expect(
      firstVisitIds([v("a", null, 3), v("b", "p2", null)], [], T0).size
    ).toBe(0);
  });
});

describe("restoreTarget", () => {
  const wasInRoom = { room_id: "r1", called_at: iso(T0 - 30 * MIN) };

  it("back into their room when it stands idle and empty", () => {
    expect(restoreTarget(wasInRoom, room(), [])).toBe("room");
    expect(
      restoreTarget(wasInRoom, room(), [called("x", "r2"), waiting("y")])
    ).toBe("room");
  });

  it("to the waiting list when someone is in the room now", () => {
    expect(restoreTarget(wasInRoom, room(), [called("x")])).toBe("waiting");
    expect(restoreTarget(wasInRoom, two(), [treating("x")])).toBe("waiting");
  });

  it("to the waiting list when someone is lined up for the room", () => {
    expect(restoreTarget(wasInRoom, room(), [nextUp("x")])).toBe("waiting");
  });

  it("to the waiting list while the room's timer runs or it is setting up", () => {
    expect(restoreTarget(wasInRoom, room(timerRunning), [])).toBe("waiting");
    expect(restoreTarget(wasInRoom, room(settingUp), [])).toBe("waiting");
  });

  it("to the waiting list if they were only lined up, or had no room", () => {
    expect(restoreTarget({ room_id: "r1", called_at: null }, room(), [])).toBe(
      "waiting"
    );
    expect(restoreTarget({ room_id: null, called_at: null }, room(), [])).toBe(
      "waiting"
    );
  });

  it("to the waiting list if the room is gone", () => {
    expect(restoreTarget(wasInRoom, null, [])).toBe("waiting");
    expect(restoreTarget(wasInRoom, room({ id: "r9" }), [])).toBe("waiting");
  });
});

describe("restoreUpdate", () => {
  it("into the room: only the ending is undone — same call, same 'seen'", () => {
    expect(restoreUpdate("a", "room")).toEqual({
      id: "a",
      fields: { done_at: null },
    });
  });

  it("to the waiting list: the room is let go as well", () => {
    expect(restoreUpdate("a", "waiting")).toEqual({
      id: "a",
      fields: {
        done_at: null,
        room_id: null,
        room_assigned_at: null,
        called_at: null,
        seen_at: null,
      },
    });
  });
});
