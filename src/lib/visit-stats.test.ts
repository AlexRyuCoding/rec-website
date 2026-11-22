import { describe, expect, it } from "vitest";
import {
  CheckinRecord,
  checkinsCsv,
  checkinStatus,
  csvCell,
  isOpenStatus,
  median,
  statusLabel,
  summarizeVisits,
  visitTimes,
  VisitTimestamps,
} from "./visit-stats";

const T0 = Date.parse("2026-11-23T18:00:00.000Z");
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const minutesAfter = (min: number) => iso(T0 + min * MIN);

// A visit that checked in at T0; the numbers are minutes after that.
const visit = (
  steps: { called?: number; seen?: number; done?: number; room?: boolean } = {},
  practitioner: string | null = "Alex Ryu"
): VisitTimestamps & { practitioner_name: string | null } => ({
  checked_in_at: iso(T0),
  room_id:
    steps.room === false
      ? null
      : steps.called !== undefined || steps.room
        ? "r1"
        : null,
  called_at: steps.called === undefined ? null : minutesAfter(steps.called),
  seen_at: steps.seen === undefined ? null : minutesAfter(steps.seen),
  done_at: steps.done === undefined ? null : minutesAfter(steps.done),
  practitioner_name: practitioner,
});

describe("checkinStatus", () => {
  const now = T0 + 30 * MIN;

  it("follows the visit through the board", () => {
    expect(checkinStatus(visit(), now)).toBe("waiting");
    expect(checkinStatus(visit({ room: true }), now)).toBe("next_up");
    expect(checkinStatus(visit({ called: 5 }), now)).toBe("called");
    expect(checkinStatus(visit({ called: 5, seen: 9 }), now)).toBe(
      "with_doctor"
    );
  });

  it("a visit the doctor saw, then marked ready, is finished", () => {
    expect(checkinStatus(visit({ called: 5, seen: 9, done: 40 }), now)).toBe(
      "finished"
    );
  });

  it("a visit ended without the doctor having come is 'removed'", () => {
    expect(checkinStatus(visit({ done: 12 }), now)).toBe("removed");
    expect(checkinStatus(visit({ called: 5, done: 12 }), now)).toBe("removed");
  });

  it("an old visit nobody ever finished is 'not closed', not 'waiting'", () => {
    const nextDay = T0 + 20 * 60 * MIN;
    expect(checkinStatus(visit(), nextDay)).toBe("not_closed");
    expect(checkinStatus(visit({ called: 5, seen: 9 }), nextDay)).toBe(
      "not_closed"
    );
    // a finished one stays finished however old
    expect(
      checkinStatus(visit({ called: 5, seen: 9, done: 40 }), nextDay)
    ).toBe("finished");
  });

  it("knows which statuses are on the board", () => {
    expect(
      ["waiting", "next_up", "called", "with_doctor"].every((s) =>
        isOpenStatus(s as never)
      )
    ).toBe(true);
    expect(
      ["finished", "removed", "not_closed"].some((s) =>
        isOpenStatus(s as never)
      )
    ).toBe(false);
  });

  it("names the room where there is one", () => {
    expect(statusLabel("with_doctor", "Room 3")).toBe("With doctor · Room 3");
    expect(statusLabel("called", null)).toBe("Called");
    expect(statusLabel("waiting", "Room 3")).toBe("Waiting");
    expect(statusLabel("finished", "Room 3")).toBe("Finished");
  });
});

describe("visitTimes", () => {
  it("measures each part of a finished visit", () => {
    expect(visitTimes(visit({ called: 6, seen: 10, done: 45 }))).toEqual({
      waitForRoomMin: 6,
      waitForDoctorMin: 4,
      visitMin: 45,
    });
  });

  it("has only the parts that have happened", () => {
    expect(visitTimes(visit())).toEqual({
      waitForRoomMin: null,
      waitForDoctorMin: null,
      visitMin: null,
    });
    expect(visitTimes(visit({ called: 6 }))).toEqual({
      waitForRoomMin: 6,
      waitForDoctorMin: null,
      visitMin: null,
    });
  });

  it("a removed no-show has no visit length", () => {
    expect(visitTimes(visit({ called: 6, done: 30 })).visitMin).toBeNull();
  });

  it("never goes below zero", () => {
    // restored into the room: the call time is from before
    expect(visitTimes(visit({ called: -3, seen: -1 })).waitForRoomMin).toBe(0);
  });
});

describe("median", () => {
  it("is the middle value", () => {
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 8])).toBe(6);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });

  it("is not dragged away by one forgotten 'Room ready'", () => {
    expect(median([40, 45, 50, 55, 900])).toBe(50);
  });
});

describe("summarizeVisits", () => {
  const rows = [
    visit({ called: 4, seen: 6, done: 40 }, "Alex Ryu"),
    visit({ called: 10, seen: 20, done: 60 }, "Alex Ryu"),
    visit({ called: 8, seen: 9, done: 50 }, "Jin Kim"),
    visit({}, "Jin Kim"),
    visit({ called: 2, done: 15 }, null),
  ];
  const summary = summarizeVisits(rows);

  it("counts every check-in, and bases each number on the visits that got that far", () => {
    expect(summary.all.checkins).toBe(5);
    expect(summary.all.waitForRoom).toEqual({
      count: 4,
      median: 6,
      longest: 10,
    });
    expect(summary.all.waitForDoctor).toEqual({
      count: 3,
      median: 2,
      longest: 10,
    });
    expect(summary.all.visit).toEqual({ count: 3, median: 50, longest: 60 });
  });

  it("breaks it down per practitioner, busiest first, 'no appointment' last", () => {
    expect(
      summary.byPractitioner.map((p) => [p.practitioner, p.checkins])
    ).toEqual([
      ["Alex Ryu", 2],
      ["Jin Kim", 2],
      [null, 1],
    ]);
    expect(summary.byPractitioner[0].waitForRoom.median).toBe(7);
    expect(summary.byPractitioner[1].visit).toEqual({
      count: 1,
      median: 50,
      longest: 50,
    });
  });

  it("is all empty for no check-ins", () => {
    const none = summarizeVisits([]);
    expect(none.all).toEqual({
      checkins: 0,
      waitForRoom: { count: 0, median: null, longest: null },
      waitForDoctor: { count: 0, median: null, longest: null },
      visit: { count: 0, median: null, longest: null },
    });
    expect(none.byPractitioner).toEqual([]);
  });
});

describe("csv", () => {
  it("quotes every cell and doubles quotes inside", () => {
    expect(csvCell('Ann "Annie" Lee')).toBe('"Ann ""Annie"" Lee"');
    expect(csvCell("Smith, John")).toBe('"Smith, John"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });

  it("defuses a value a spreadsheet would run as a formula", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(
      `"'=HYPERLINK(""http://x"")"`
    );
    expect(csvCell("+1 415 555 1234")).toBe(`"'+1 415 555 1234"`);
    expect(csvCell("-Sam")).toBe(`"'-Sam"`);
    expect(csvCell("@home")).toBe(`"'@home"`);
    // an ordinary hyphenated name is left alone
    expect(csvCell("Jones-Smith")).toBe('"Jones-Smith"');
  });

  it("writes one line per check-in with the times and waits", () => {
    const record: CheckinRecord = {
      id: "c1",
      first_name: "José",
      last_name: "Muñoz",
      appointment_at: minutesAfter(10),
      service_name: "Cupping",
      room_name: "Room 3",
      ...visit({ called: 6, seen: 10, done: 45 }),
    };
    const csv = checkinsCsv(
      [record],
      T0 + 60 * MIN,
      (iso) => `T${(Date.parse(iso) - T0) / MIN}`
    );
    const [header, line] = csv.split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header.replace("﻿", "")).toBe(
      '"Checked in","Patient","Appointment","Service","Practitioner","Room","Status","Called to room","Doctor in","Finished","Wait for a room (min)","Wait for the doctor (min)","Whole visit (min)"'
    );
    expect(line).toBe(
      '"T0","José Muñoz","T10","Cupping","Alex Ryu","Room 3","Finished","T6","T10","T45","6","4","45"'
    );
  });
});
