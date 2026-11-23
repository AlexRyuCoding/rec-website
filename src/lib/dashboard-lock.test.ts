import { describe, expect, it } from "vitest";
import {
  DASHBOARD_IDLE_MS,
  DASHBOARD_WARNING_MS,
  dashboardLocked,
  lockPhase,
  renewDashboardActivity,
  shouldReportActivity,
} from "./dashboard-lock";

const T = 1_800_000_000_000; // any moment
const MIN = 60_000;

describe("dashboardLocked", () => {
  it("is open for 30 minutes after the dashboard was last used", () => {
    expect(DASHBOARD_IDLE_MS).toBe(30 * MIN);
    expect(dashboardLocked(T, T)).toBe(false);
    expect(dashboardLocked(T, T + 30 * MIN - 1)).toBe(false);
    expect(dashboardLocked(T, T + 30 * MIN)).toBe(true);
  });

  it("is locked when nothing is known — a sign-in from before the lock existed", () => {
    expect(dashboardLocked(undefined, T)).toBe(true);
    expect(dashboardLocked(null, T)).toBe(true);
    expect(dashboardLocked("1800000000000", T)).toBe(true);
    expect(dashboardLocked(Number.NaN, T)).toBe(true);
  });

  it("is locked for a moment in the future (a forged or broken clock)", () => {
    expect(dashboardLocked(T + 10 * MIN, T)).toBe(true);
    // …but a few seconds of clock difference between servers is not that.
    expect(dashboardLocked(T + 2_000, T)).toBe(false);
  });
});

describe("renewDashboardActivity", () => {
  it("moves the moment forward while the dashboard is still open", () => {
    expect(renewDashboardActivity(T, T + 5 * MIN)).toBe(T + 5 * MIN);
  });

  it("refuses once it has locked: only signing in again opens it", () => {
    expect(renewDashboardActivity(T, T + 30 * MIN)).toBe(T);
    expect(renewDashboardActivity(T, T + 3 * 60 * MIN)).toBe(T);
  });

  it("does not invent a moment where there was none", () => {
    expect(renewDashboardActivity(undefined, T)).toBeUndefined();
  });
});

describe("lockPhase (what the page shows, from the last real input)", () => {
  it("open, then a warning for the last minute, then locked", () => {
    expect(DASHBOARD_WARNING_MS).toBe(MIN);
    expect(lockPhase(T, T)).toBe("open");
    expect(lockPhase(T, T + 29 * MIN - 1)).toBe("open");
    expect(lockPhase(T, T + 29 * MIN)).toBe("warning");
    expect(lockPhase(T, T + 30 * MIN - 1)).toBe("warning");
    expect(lockPhase(T, T + 30 * MIN)).toBe("locked");
  });
});

describe("shouldReportActivity", () => {
  it("tells the server at most once a minute, and only about new input", () => {
    // input since the last report, a minute or more ago → report
    expect(shouldReportActivity(T + 61_000, T, T + 61_000)).toBe(true);
    // input, but reported less than a minute ago → wait
    expect(shouldReportActivity(T + 30_000, T, T + 30_000)).toBe(false);
    // a minute passed, but nobody touched anything since → say nothing
    expect(shouldReportActivity(T - 1, T, T + 5 * MIN)).toBe(false);
  });
});
