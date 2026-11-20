import { describe, expect, it } from "vitest";
import { mergeLingering, nextDeparted } from "./lingering";

const call = (id: string, at: number) => ({ id, at });
const rank = (c: { at: number }) => c.at;
const shape = (rows: { item: { id: string }; leaving: boolean }[]) =>
  rows.map((r) => (r.leaving ? `(${r.item.id})` : r.item.id)).join(" ");

describe("mergeLingering", () => {
  it("keeps a departing row where it was, newest first", () => {
    const rows = mergeLingering(
      [call("c", 30), call("a", 10)],
      [call("b", 20)],
      rank
    );
    expect(shape(rows)).toBe("c (b) a");
  });

  it("puts a new arrival on top without disturbing a row on its way out", () => {
    const rows = mergeLingering(
      [call("d", 40), call("a", 10)],
      [call("c", 30), call("b", 20)],
      rank
    );
    expect(shape(rows)).toBe("d (c) (b) a");
  });

  it("treats something that came back as present, once", () => {
    const rows = mergeLingering([call("a", 10)], [call("a", 10)], rank);
    expect(shape(rows)).toBe("a");
  });

  it("is stable for equal ranks", () => {
    const rows = mergeLingering(
      [call("a", 5), call("b", 5)],
      [call("z", 5)],
      rank
    );
    expect(shape(rows)).toBe("a b (z)");
  });
});

describe("nextDeparted", () => {
  const ids = (items: { id: string }[]) => items.map((i) => i.id).join(" ");

  it("adds what just left", () => {
    expect(
      ids(nextDeparted([], [call("a", 1), call("b", 2)], [call("b", 2)]))
    ).toBe("a");
  });

  it("keeps earlier departures and never lists one twice", () => {
    const departed = [call("a", 1)];
    expect(ids(nextDeparted(departed, [call("b", 2)], []))).toBe("a b");
    expect(ids(nextDeparted(departed, [call("a", 1)], []))).toBe("a");
  });

  it("drops one that has come back", () => {
    expect(ids(nextDeparted([call("a", 1)], [], [call("a", 1)]))).toBe("");
  });

  it("changes nothing when nothing left", () => {
    expect(
      ids(nextDeparted([], [call("a", 1)], [call("a", 1), call("b", 2)]))
    ).toBe("");
  });
});
