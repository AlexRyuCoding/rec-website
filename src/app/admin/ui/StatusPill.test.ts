import { describe, expect, it } from "vitest";
import type { CheckinStatus } from "@/lib/visit-stats";
import { pillLook } from "./StatusPill";

const ALL: CheckinStatus[] = [
  "waiting",
  "next_up",
  "called",
  "with_doctor",
  "finished",
  "removed",
  "not_closed",
];

describe("pillLook", () => {
  // The complaint this answers: four statuses were the same teal text.
  it("gives every status its own look", () => {
    const tones = ALL.map((s) => pillLook(s).tone);
    expect(new Set(tones).size).toBe(7);
  });

  // Shape as well as colour: a visit still on the board carries a dot, a
  // visit that ended carries a mark.
  it("marks the visits still on the board with a dot, and only those", () => {
    expect(ALL.filter((s) => pillLook(s).mark === "dot")).toEqual([
      "waiting",
      "next_up",
      "called",
      "with_doctor",
    ]);
  });

  it("gives each ended visit a different mark", () => {
    expect(pillLook("finished").mark).toBe("check");
    expect(pillLook("removed").mark).toBe("x");
    expect(pillLook("not_closed").mark).toBe("alert");
  });
});
