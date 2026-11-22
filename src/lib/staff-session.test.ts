import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTER_LOGIN,
  loginPathFor,
  safeNextPath,
  sessionDayEnd,
  sessionDayOver,
} from "./staff-session";

// November 2026: the clinic (Los Angeles) is on PST, UTC-8.
const pst = (local: string) => Date.parse(`${local}-08:00`);
// July 2026: PDT, UTC-7.
const pdt = (local: string) => Date.parse(`${local}-07:00`);

describe("sessionDayEnd", () => {
  it("a morning sign-in lasts until 3 am the next night", () => {
    expect(sessionDayEnd(pst("2026-11-23T08:10:00"))).toBe(
      pst("2026-11-24T03:00:00")
    );
  });

  it("an evening sign-in ends at the same 3 am, not 24 hours later", () => {
    expect(sessionDayEnd(pst("2026-11-23T18:45:30"))).toBe(
      pst("2026-11-24T03:00:00")
    );
  });

  it("a sign-in after midnight ends at 3 am the same night", () => {
    expect(sessionDayEnd(pst("2026-11-24T01:30:00"))).toBe(
      pst("2026-11-24T03:00:00")
    );
  });

  it("a sign-in at exactly 3 am gets the whole next day", () => {
    expect(sessionDayEnd(pst("2026-11-24T03:00:00"))).toBe(
      pst("2026-11-25T03:00:00")
    );
  });

  it("follows the clinic's clock in summer time too", () => {
    expect(sessionDayEnd(pdt("2026-07-06T08:10:00"))).toBe(
      pdt("2026-07-07T03:00:00")
    );
  });

  it("never lasts longer than a day", () => {
    for (let hour = 0; hour < 24; hour++) {
      const now = pst("2026-11-23T00:00:00") + hour * 3600_000 + 1234;
      const left = sessionDayEnd(now) - now;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThanOrEqual(24 * 3600_000);
    }
  });
});

describe("sessionDayOver", () => {
  const end = pst("2026-11-24T03:00:00");

  it("is not over before the day's end", () => {
    expect(sessionDayOver(end, end - 1)).toBe(false);
  });

  it("is over from the day's end on", () => {
    expect(sessionDayOver(end, end)).toBe(true);
    expect(sessionDayOver(end, end + 5 * 3600_000)).toBe(true);
  });

  it("leaves a sign-in from before this rule alone", () => {
    expect(sessionDayOver(undefined, end + 1)).toBe(false);
    expect(sessionDayOver("soon", end + 1)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a staff page, with its query", () => {
    expect(safeNextPath("/admin/rooms")).toBe("/admin/rooms");
    expect(safeNextPath("/admin/dashboard?tab=patients")).toBe(
      "/admin/dashboard?tab=patients"
    );
  });

  it("falls back to the kiosk when nothing was asked for", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("refuses anything that is not one of our staff pages", () => {
    for (const bad of [
      "https://evil.example/admin/rooms",
      "//evil.example/admin/",
      "/\\evil.example",
      "/admin/\\evil.example",
      "/waiting-room",
      "/api/admin/checkins",
      "admin/rooms",
      "/admin",
    ]) {
      expect(safeNextPath(bad)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("never sends staff back to the login page itself", () => {
    expect(safeNextPath("/admin/login")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/admin/login?error=AccessDenied")).toBe(
      DEFAULT_AFTER_LOGIN
    );
  });
});

describe("loginPathFor", () => {
  it("carries the page staff were on", () => {
    expect(loginPathFor("/admin/rooms")).toBe(
      "/admin/login?next=%2Fadmin%2Frooms"
    );
    expect(loginPathFor("/admin/dashboard?tab=patients")).toBe(
      "/admin/login?next=%2Fadmin%2Fdashboard%3Ftab%3Dpatients"
    );
  });

  it("is the plain login page from the kiosk", () => {
    expect(loginPathFor("/admin/patient-signin")).toBe("/admin/login");
  });
});
