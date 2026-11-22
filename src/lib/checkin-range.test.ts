import { describe, expect, it } from "vitest";
import {
  customRange,
  dateInputValue,
  defaultCustomDates,
  presetRange,
  rangeIncludesNow,
} from "./checkin-range";

// Local times throughout: the ranges are calendar days of the computer
// the dashboard is open on.
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);
const NOW = at(2026, 11, 23, 14, 30);

const isMidnight = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;

describe("presetRange", () => {
  it("today is the whole of today", () => {
    expect(presetRange("today", NOW)).toEqual({
      from: at(2026, 11, 23),
      to: at(2026, 11, 24),
    });
  });

  it("yesterday ends where today begins", () => {
    expect(presetRange("yesterday", NOW)).toEqual({
      from: at(2026, 11, 22),
      to: at(2026, 11, 23),
    });
  });

  it("past week is today and the six days before", () => {
    expect(presetRange("week", NOW)).toEqual({
      from: at(2026, 11, 17),
      to: at(2026, 11, 24),
    });
  });

  it("this month starts on the 1st and includes today", () => {
    expect(presetRange("month", NOW)).toEqual({
      from: at(2026, 11, 1),
      to: at(2026, 11, 24),
    });
  });

  it("crosses a month and a year boundary", () => {
    expect(presetRange("yesterday", at(2027, 1, 1, 9)).from).toEqual(
      at(2026, 12, 31)
    );
    expect(presetRange("week", at(2026, 3, 2, 9)).from).toEqual(
      at(2026, 2, 24)
    );
  });

  it("always starts and ends at midnight, also around a clock change", () => {
    // US clocks go forward on 8 March and back on 1 November 2026. Where
    // the computer observes them, "plus 24 hours" would miss midnight.
    for (const day of [
      at(2026, 3, 8, 12),
      at(2026, 3, 9, 12),
      at(2026, 11, 1, 12),
      at(2026, 11, 2, 12),
    ]) {
      for (const preset of ["today", "yesterday", "week", "month"] as const) {
        const { from, to } = presetRange(preset, day);
        expect(isMidnight(from)).toBe(true);
        expect(isMidnight(to)).toBe(true);
      }
    }
    expect(presetRange("yesterday", at(2026, 3, 9, 12)).from).toEqual(
      at(2026, 3, 8)
    );
  });
});

describe("customRange", () => {
  it("includes both days typed", () => {
    expect(customRange("2026-11-01", "2026-11-15")).toEqual({
      from: at(2026, 11, 1),
      to: at(2026, 11, 16),
    });
  });

  it("one day is a whole day", () => {
    expect(customRange("2026-11-15", "2026-11-15")).toEqual({
      from: at(2026, 11, 15),
      to: at(2026, 11, 16),
    });
  });

  it("swaps dates typed the wrong way round", () => {
    expect(customRange("2026-11-15", "2026-11-01")).toEqual(
      customRange("2026-11-01", "2026-11-15")
    );
  });

  it("is nothing until both dates are there", () => {
    expect(customRange("", "2026-11-15")).toBeNull();
    expect(customRange("2026-11-15", "")).toBeNull();
    expect(customRange("15/11/2026", "2026-11-15")).toBeNull();
  });
});

describe("defaultCustomDates", () => {
  it("opens on the last 30 days, ending today — not in the future", () => {
    expect(defaultCustomDates(NOW)).toEqual({
      from: "2026-10-25",
      to: "2026-11-23",
    });
  });

  it("writes dates the way a date field holds them", () => {
    expect(dateInputValue(at(2026, 3, 5))).toBe("2026-03-05");
  });
});

describe("rangeIncludesNow", () => {
  it("is true for ranges that reach today", () => {
    for (const preset of ["today", "week", "month"] as const) {
      expect(rangeIncludesNow(presetRange(preset, NOW), NOW)).toBe(true);
    }
  });

  it("is false for yesterday and for a past custom range", () => {
    expect(rangeIncludesNow(presetRange("yesterday", NOW), NOW)).toBe(false);
    expect(
      rangeIncludesNow(customRange("2026-10-01", "2026-10-31")!, NOW)
    ).toBe(false);
  });
});
