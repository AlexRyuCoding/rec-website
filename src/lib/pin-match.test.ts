import { describe, expect, it } from "vitest";
import { firstMatch } from "./pin-match";

interface Row {
  id: string;
  pin: string;
}

// "Hashes" here are plain text and a compare is a string comparison: the
// rules under test are about order and how many compares run at a time,
// not about bcrypt (pin-hash.test.ts has the real thing).
const rows = (count: number, pins: Record<number, string> = {}): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${String(i).padStart(4, "0")}`,
    pin: pins[i] ?? `other-${i}`,
  }));

// A compare that answers after `delayFor(hash)` ms and keeps count.
function slowCompare(delayFor: (hash: string) => number = () => 0) {
  const state = { calls: [] as string[], running: 0, mostAtOnce: 0 };
  const compare = (pin: string, hash: string) =>
    new Promise<boolean>((resolve) => {
      state.calls.push(hash);
      state.running++;
      state.mostAtOnce = Math.max(state.mostAtOnce, state.running);
      setTimeout(() => {
        state.running--;
        resolve(hash === pin);
      }, delayFor(hash));
    });
  return { compare, state };
}

describe("firstMatch", () => {
  it("finds the one row among many", async () => {
    const { compare } = slowCompare();
    const list = rows(1000, { 777: "4821" });
    expect(await firstMatch(list, "4821", compare, 4)).toBe(list[777]);
  });

  it("returns null when no row matches — after comparing every one, once", async () => {
    const { compare, state } = slowCompare();
    const list = rows(103);
    expect(await firstMatch(list, "4821", compare, 4)).toBeNull();
    expect(state.calls).toHaveLength(103);
    expect(new Set(state.calls).size).toBe(103);
  });

  it("returns null for no rows without comparing anything", async () => {
    const { compare, state } = slowCompare();
    expect(await firstMatch([], "4821", compare, 4)).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it("never runs more compares at a time than the width", async () => {
    for (const width of [1, 3, 8]) {
      const { compare, state } = slowCompare(() => 1);
      await firstMatch(rows(40), "4821", compare, width);
      expect(state.mostAtOnce).toBe(width);
    }
  });

  it("stops after the group that holds the match", async () => {
    const { compare, state } = slowCompare();
    const list = rows(1000, { 5: "4821" });
    expect(await firstMatch(list, "4821", compare, 4)).toBe(list[5]);
    // rows 0–7: the first two groups of four, and nothing after them
    expect(state.calls).toHaveLength(8);
  });

  it("with two matches, always returns the earlier row — whichever compare answers first", async () => {
    // Two holders cannot share a PIN, but the answer must not depend on
    // that: the later row's compare is the fast one here.
    // "4821" and "4821 " both count as the PIN below, so the two matching
    // rows can be told apart and given different speeds.
    const list = rows(12, { 2: "4821 ", 3: "4821", 9: "4821" });
    const earlierRowAnswersLast = (pin: string, hash: string) =>
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(hash.trim() === pin), hash === "4821 " ? 8 : 0)
      );
    for (const width of [1, 2, 4, 12]) {
      expect(await firstMatch(list, "4821", earlierRowAnswersLast, width)).toBe(
        list[2]
      );
    }
  });

  it("gives the same answer as one-at-a-time for every width", async () => {
    const list = rows(50, { 31: "4821", 44: "4821" });
    for (const width of [1, 2, 3, 4, 7, 50, 200]) {
      const { compare } = slowCompare((hash) => (hash.length * 7) % 3);
      expect(await firstMatch(list, "4821", compare, width)).toBe(list[31]);
    }
  });

  it("a width that is not a whole number of at least 1 means one at a time", async () => {
    for (const width of [0, -3, 0.5, Number.NaN]) {
      const { compare, state } = slowCompare(() => 1);
      const list = rows(6, { 4: "4821" });
      expect(await firstMatch(list, "4821", compare, width)).toBe(list[4]);
      expect(state.mostAtOnce).toBe(1);
    }
  });

  it("a compare that fails is a failure — never 'nobody has this PIN'", async () => {
    const list = rows(10, { 9: "4821" });
    const broken = async (_pin: string, hash: string) => {
      if (hash === "other-6") throw new Error("compare failed");
      return hash === "4821";
    };
    await expect(firstMatch(list, "4821", broken, 4)).rejects.toThrow(
      "compare failed"
    );
  });
});
