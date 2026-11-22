import { describe, expect, it } from "vitest";
import type { CheckinStatus } from "@/lib/visit-stats";
import { pillLook } from "./StatusPill";

const ALL: CheckinStatus[] = [
  "waiting",
  "next_up",
  "called",
  "with_doctor",
  "in_use",
  "complete",
  "overtime",
  "turnover",
  "finished",
  "removed",
  "not_closed",
];

describe("pillLook", () => {
  // The complaint this answers: four statuses were the same teal text.
  it("gives every status its own look", () => {
    const tones = ALL.map((s) => pillLook(s).tone);
    expect(new Set(tones).size).toBe(ALL.length);
  });

  // Shape as well as colour. A visit that ended carries a mark; one still
  // on the board carries a dot — or, once its room is on the timer, a
  // clock, and a bell when the timer has run out.
  it("marks the visits still on the board, by where they are", () => {
    const marks = Object.fromEntries(ALL.map((s) => [s, pillLook(s).mark]));
    expect(marks).toMatchObject({
      waiting: "dot",
      next_up: "dot",
      called: "dot",
      with_doctor: "dot",
      in_use: "timer",
      complete: "bell",
      overtime: "bell",
      turnover: "dot",
    });
  });

  it("gives each ended visit a different mark", () => {
    expect(pillLook("finished").mark).toBe("check");
    expect(pillLook("removed").mark).toBe("x");
    expect(pillLook("not_closed").mark).toBe("alert");
  });
});
