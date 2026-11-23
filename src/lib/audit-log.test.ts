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

// ---- sign-ins (migration 0022) -------------------------------------------

import {
  NO_ADDRESS,
  REFUSED_DETAIL,
  REFUSED_PER_HOUR,
  REFUSED_REPEAT_MS,
  REFUSED_WINDOW_MS,
  refusedRowVerdict,
  signInAddress,
  SIGNIN_ADDRESS_MAX,
} from "./audit-log";

describe("sign-in actions", () => {
  it("are known actions, worded like the rest of the logbook", () => {
    expect(ACTION_LABELS.staff_signin).toBe("Signed in");
    expect(ACTION_LABELS.staff_signout).toBe("Signed out");
    expect(ACTION_LABELS.signin_refused).toBe("Sign-in refused");
    expect(REFUSED_DETAIL).toBe("Not on the staff list");
    expect(isStaffAction("staff_signin")).toBe(true);
    expect(isStaffAction("staff_signout")).toBe(true);
    expect(isStaffAction("signin_refused")).toBe(true);
  });
});

describe("signInAddress — an address a stranger chose", () => {
  it("is stored lowercase, as the allowlist compares it", () => {
    expect(signInAddress("Someone.Else@Example.com")).toBe(
      "someone.else@example.com"
    );
  });

  it("is cut to the longest an email address can be", () => {
    const long = `${"a".repeat(400)}@example.com`;
    expect(signInAddress(long)).toHaveLength(SIGNIN_ADDRESS_MAX);
    expect(SIGNIN_ADDRESS_MAX).toBe(254);
  });

  it("never cuts a character in half", () => {
    // Each of these is two UTF-16 units; a cut between them would leave
    // half a character, which the database refuses.
    const cut = signInAddress("😀".repeat(300));
    expect([...cut]).toHaveLength(SIGNIN_ADDRESS_MAX);
    expect(() => encodeURIComponent(cut)).not.toThrow();
    // …and half a character that arrives is dropped.
    expect(signInAddress("a\uD83Db@example.com")).toBe("ab@example.com");
  });

  it("loses line breaks, blanks and invisible characters", () => {
    expect(signInAddress(" a\n b\t@\u0000ex\u200Bample\u202E.com\r\n")).toBe(
      "ab@example.com"
    );
  });

  it("stays text: markup and SQL are kept as the characters they are", () => {
    expect(signInAddress("<script>alert(1)</script>@example.com")).toBe(
      "<script>alert(1)</script>@example.com"
    );
    expect(signInAddress("x';drop--@example.com")).toBe(
      "x';drop--@example.com"
    );
  });

  it("says so when there is no address at all", () => {
    expect(signInAddress(null)).toBe(NO_ADDRESS);
    expect(signInAddress(undefined)).toBe(NO_ADDRESS);
    expect(signInAddress("")).toBe(NO_ADDRESS);
    expect(signInAddress(" \n\t")).toBe(NO_ADDRESS);
    expect(signInAddress({ toString: () => "a@b.c" })).toBe(NO_ADDRESS);
    expect(signInAddress(42)).toBe(NO_ADDRESS);
  });
});

describe("refusedRowVerdict — how many refused sign-ins are written", () => {
  const NOW = Date.parse("2026-11-23T20:00:00.000Z");
  const row = (staff_email: string, msAgo: number) => ({
    staff_email,
    at: new Date(NOW - msAgo).toISOString(),
  });

  it("writes the first refusal of an address", () => {
    expect(refusedRowVerdict([], "x@example.com", NOW)).toBe("write");
    expect(
      refusedRowVerdict([row("other@example.com", 1000)], "x@example.com", NOW)
    ).toBe("write");
  });

  it("does not repeat the same address within fifteen minutes", () => {
    expect(REFUSED_REPEAT_MS).toBe(15 * 60 * 1000);
    expect(
      refusedRowVerdict([row("x@example.com", 1000)], "x@example.com", NOW)
    ).toBe("repeat");
    expect(
      refusedRowVerdict(
        [row("x@example.com", REFUSED_REPEAT_MS - 1)],
        "x@example.com",
        NOW
      )
    ).toBe("repeat");
  });

  it("writes the address again once fifteen minutes have passed", () => {
    expect(
      refusedRowVerdict(
        [row("x@example.com", REFUSED_REPEAT_MS + 1)],
        "x@example.com",
        NOW
      )
    ).toBe("write");
  });

  it("stops at twenty refused rows an hour, whoever they are", () => {
    expect(REFUSED_PER_HOUR).toBe(20);
    expect(REFUSED_WINDOW_MS).toBe(60 * 60 * 1000);
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        row(`stranger${i}@example.com`, 20 * 60 * 1000 + i)
      );
    expect(
      refusedRowVerdict(many(REFUSED_PER_HOUR - 1), "x@example.com", NOW)
    ).toBe("write");
    expect(
      refusedRowVerdict(many(REFUSED_PER_HOUR), "x@example.com", NOW)
    ).toBe("full");
  });

  it("rows older than the hour do not count", () => {
    const old = Array.from({ length: 50 }, (_, i) =>
      row(`stranger${i}@example.com`, REFUSED_WINDOW_MS + 1000 + i)
    );
    expect(refusedRowVerdict(old, "x@example.com", NOW)).toBe("write");
  });

  it("a row whose time cannot be read counts against the limit", () => {
    const odd = Array.from({ length: REFUSED_PER_HOUR }, () => ({
      staff_email: "s@example.com",
      at: "not a time",
    }));
    expect(refusedRowVerdict(odd, "x@example.com", NOW)).toBe("full");
  });
});
