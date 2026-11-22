import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  checkinRangeDetail,
  isStaffAction,
  patientsSummary,
  STAFF_ACTIONS,
} from "./audit-log";

describe("staff actions", () => {
  it("every action has a name on the Log page", () => {
    for (const action of STAFF_ACTIONS) {
      expect(ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("recognises only known actions", () => {
    expect(isStaffAction("pin_reset")).toBe(true);
    expect(isStaffAction("something_else")).toBe(false);
    expect(isStaffAction(null)).toBe(false);
  });
});

describe("checkinRangeDetail", () => {
  // The dashboard sends the browser's midnights; in the clinic (Los
  // Angeles, UTC-8 in November) that is 08:00 UTC.
  it("one day is that date", () => {
    expect(
      checkinRangeDetail("2026-11-23T08:00:00.000Z", "2026-11-24T08:00:00.000Z")
    ).toBe("2026-11-23");
  });

  it("several days are first to last, both included", () => {
    expect(
      checkinRangeDetail("2026-11-01T07:00:00.000Z", "2026-11-24T08:00:00.000Z")
    ).toBe("2026-11-01 to 2026-11-23");
  });

  it("a later page says where it starts", () => {
    expect(
      checkinRangeDetail(
        "2026-11-01T07:00:00.000Z",
        "2026-11-24T08:00:00.000Z",
        500
      )
    ).toBe("2026-11-01 to 2026-11-23, from row 501");
  });
});

describe("patientsSummary", () => {
  it("names one, two or a few", () => {
    expect(patientsSummary(["Ann Licater"], 1)).toBe("Ann Licater");
    expect(patientsSummary(["Ann Licater", "Bob Stone"], 2)).toBe(
      "Ann Licater and Bob Stone"
    );
    expect(patientsSummary(["Ann Licater", "Bob Stone", "Cy Diaz"], 3)).toBe(
      "Ann Licater, Bob Stone and Cy Diaz"
    );
  });

  it("counts the rest of a long list", () => {
    expect(patientsSummary(["Ann Licater", "Bob Stone"], 40)).toBe(
      "Ann Licater, Bob Stone and 38 more"
    );
  });

  it("says how many when the records are gone", () => {
    expect(patientsSummary([], 1)).toBe("1 patient");
    expect(patientsSummary([], 3)).toBe("3 patients");
  });

  it("is empty when the action named nobody", () => {
    expect(patientsSummary([], 0)).toBe("");
  });
});
