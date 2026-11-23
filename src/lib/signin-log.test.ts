// The sign-in rows of the staff audit log, against the in-memory
// database: what is written, what is not, and that nothing here can stop
// or hold up a sign-in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NO_ADDRESS,
  REFUSED_PER_HOUR,
  REFUSED_REPEAT_MS,
  REFUSED_WINDOW_MS,
  SIGNIN_ADDRESS_MAX,
} from "./audit-log";
import { loadAuditPage } from "./audit-server";
import {
  recordSignIn,
  recordSignInRefused,
  recordSignOut,
  SIGNIN_LOG_TIMEOUT_MS,
} from "./signin-log";
import { FakeDbOptions, fakeSupabase } from "./testing/fake-supabase";

const NOW = Date.parse("2026-11-23T20:00:00.000Z");
const MIN = 60_000;

type Row = Record<string, unknown>;

function logDb(rows: Row[] = [], options: FakeDbOptions = {}) {
  let nextId = rows.length;
  let clock = NOW;
  const db = fakeSupabase(
    { staff_audit_log: rows },
    {
      onInsert: (_table, row) => {
        row.id = ++nextId;
        row.at = new Date(clock).toISOString();
      },
      ...options,
    }
  );
  return {
    ...db,
    get: () => db.client,
    log: () => db.tables.staff_audit_log as Row[],
    setClock: (ms: number) => (clock = ms),
  };
}

// The database before migration 0022: the look-back answers, a row with
// one of the three new actions is refused by the table's check.
const beforeMigration: FakeDbOptions = {
  onQuery: (query) => (query.kind === "insert" ? "23514" : undefined),
};

let logged: ReturnType<typeof vi.spyOn>;
const lines = () => JSON.stringify(logged.mock.calls);

beforeEach(() => {
  vi.stubEnv("ALLOWED_ADMIN_EMAILS", "desk@example.com, doctor@example.com");
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("recordSignIn", () => {
  it("writes who signed in, naming no patient", async () => {
    const db = logDb();
    await recordSignIn("Desk@Example.com", db.get);
    expect(db.log()).toEqual([
      {
        id: 1,
        at: new Date(NOW).toISOString(),
        staff_email: "desk@example.com",
        action: "staff_signin",
        patient_ids: [],
        detail: null,
      },
    ]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("before migration 0022: resolves, and logs one line with the code only", async () => {
    const db = logDb([], beforeMigration);
    await expect(recordSignIn("desk@example.com", db.get)).resolves.toBe(
      undefined
    );
    expect(db.log()).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("audit log write failed");
    expect(lines()).toContain("staff_signin");
    expect(lines()).toContain("23514");
    expect(lines()).not.toContain("desk@example.com");
  });

  it("resolves when the database cannot even be reached for", async () => {
    const broken = () => {
      throw new Error("DB_REST_URL is set without DB_REST_JWT");
    };
    await expect(recordSignIn("desk@example.com", broken)).resolves.toBe(
      undefined
    );
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).not.toContain("DB_REST");
  });

  it("resolves when the client throws", async () => {
    const client = {
      from: () => {
        throw new TypeError("fetch failed for desk@example.com");
      },
    } as unknown as SupabaseClient;
    await expect(recordSignIn("desk@example.com", () => client)).resolves.toBe(
      undefined
    );
    expect(lines()).not.toContain("desk@example.com");
  });

  it("does not wait for a database that never answers", async () => {
    vi.useFakeTimers();
    const never = {
      from: () => ({ insert: () => new Promise(() => {}) }),
    } as unknown as SupabaseClient;
    let settled = false;
    const done = recordSignIn("desk@example.com", () => never).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(SIGNIN_LOG_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(settled).toBe(true);
    expect(SIGNIN_LOG_TIMEOUT_MS).toBeLessThanOrEqual(3000);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("Timeout");
  });
});

describe("recordSignOut", () => {
  const token = (over: Row = {}) => ({
    email: "desk@example.com",
    dayEnd: NOW + 60 * MIN,
    ...over,
  });

  it("writes who pressed Sign out", async () => {
    const db = logDb();
    await recordSignOut(token({ email: "Desk@Example.com" }), NOW, db.get);
    expect(db.log()).toMatchObject([
      {
        staff_email: "desk@example.com",
        action: "staff_signout",
        patient_ids: [],
        detail: null,
      },
    ]);
  });

  it("writes nothing when nobody was signed in", async () => {
    const db = logDb();
    await recordSignOut(null, NOW, db.get);
    await recordSignOut(undefined, NOW, db.get);
    await recordSignOut({}, NOW, db.get);
    await recordSignOut(token({ email: 7 }), NOW, db.get);
    expect(db.log()).toEqual([]);
    expect(db.queries).toEqual([]);
  });

  it("writes nothing for a sign-in that had already ended at 3 am", async () => {
    const db = logDb();
    await recordSignOut(token({ dayEnd: NOW }), NOW, db.get);
    await recordSignOut(token({ dayEnd: NOW - 60 * MIN }), NOW, db.get);
    expect(db.log()).toEqual([]);
  });

  it("writes nothing for an account no longer on the staff list", async () => {
    const db = logDb();
    await recordSignOut(token({ email: "gone@example.com" }), NOW, db.get);
    expect(db.log()).toEqual([]);
  });

  it("before migration 0022: resolves, one line", async () => {
    const db = logDb([], beforeMigration);
    await expect(recordSignOut(token(), NOW, db.get)).resolves.toBe(undefined);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("staff_signout");
    expect(lines()).toContain("23514");
  });
});

describe("recordSignInRefused", () => {
  const refused = (staff_email: string, msAgo: number, id: number): Row => ({
    id,
    at: new Date(NOW - msAgo).toISOString(),
    staff_email,
    action: "signin_refused",
    patient_ids: [],
    detail: "Not on the staff list",
  });

  it("writes the address that tried, and why it was refused", async () => {
    const db = logDb();
    await recordSignInRefused("Stranger@Example.com", NOW, db.get);
    expect(db.log()).toEqual([
      {
        id: 1,
        at: new Date(NOW).toISOString(),
        staff_email: "stranger@example.com",
        action: "signin_refused",
        patient_ids: [],
        detail: "Not on the staff list",
      },
    ]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("the same address again within fifteen minutes is not a second row", async () => {
    const db = logDb();
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    await recordSignInRefused("STRANGER@example.com", NOW + MIN, db.get);
    await recordSignInRefused(
      "stranger@example.com",
      NOW + REFUSED_REPEAT_MS - 1,
      db.get
    );
    expect(db.log()).toHaveLength(1);
    // A repeat is ordinary (a staff member trying their personal account
    // twice): it is not worth a line in the server log.
    expect(logged).not.toHaveBeenCalled();
  });

  it("…and is a row again after fifteen minutes", async () => {
    const db = logDb();
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    const later = NOW + REFUSED_REPEAT_MS + 1000;
    db.setClock(later);
    await recordSignInRefused("stranger@example.com", later, db.get);
    expect(db.log()).toHaveLength(2);
  });

  it("another address is its own row", async () => {
    const db = logDb();
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    await recordSignInRefused("other@example.com", NOW, db.get);
    expect(db.log().map((r) => r.staff_email)).toEqual([
      "stranger@example.com",
      "other@example.com",
    ]);
  });

  it("many strangers: twenty rows an hour and no more", async () => {
    const db = logDb();
    for (let i = 0; i < 200; i++) {
      await recordSignInRefused(`stranger${i}@example.com`, NOW + i, db.get);
    }
    expect(db.log()).toHaveLength(REFUSED_PER_HOUR);
    // Each attempt past the limit leaves a line in the server log — that
    // it happened, and never the address.
    expect(logged).toHaveBeenCalledTimes(200 - REFUSED_PER_HOUR);
    expect(lines()).toContain("refused sign-in not recorded");
    expect(lines()).not.toContain("@example.com");
  });

  it("…also when they all arrive at the same moment", async () => {
    const db = logDb();
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        recordSignInRefused(`stranger${i}@example.com`, NOW + i, db.get)
      )
    );
    expect(db.log()).toHaveLength(REFUSED_PER_HOUR);
  });

  it("the same address arriving many times at once is one row", async () => {
    const db = logDb();
    await Promise.all(
      Array.from({ length: 50 }, () =>
        recordSignInRefused("stranger@example.com", NOW, db.get)
      )
    );
    expect(db.log()).toHaveLength(1);
  });

  it("the limit is the last hour's: older rows do not count", async () => {
    const db = logDb(
      Array.from({ length: 60 }, (_, i) =>
        refused(`old${i}@example.com`, REFUSED_WINDOW_MS + MIN + i, i + 1)
      )
    );
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    expect(db.log()).toHaveLength(61);
  });

  it("the limit never touches a staff member's own sign-in", async () => {
    const db = logDb(
      Array.from({ length: REFUSED_PER_HOUR }, (_, i) =>
        refused(`s${i}@example.com`, MIN + i, i + 1)
      )
    );
    await recordSignIn("desk@example.com", db.get);
    await recordSignOut(
      { email: "desk@example.com", dayEnd: NOW + MIN },
      NOW,
      db.get
    );
    expect(
      db
        .log()
        .slice(-2)
        .map((r) => r.action)
    ).toEqual(["staff_signin", "staff_signout"]);
  });

  it("rows of other kinds do not use the limit up", async () => {
    const db = logDb(
      Array.from({ length: 40 }, (_, i) => ({
        ...refused("stranger@example.com", MIN + i, i + 1),
        action: "patient_search",
      }))
    );
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    expect(db.log()).toHaveLength(41);
  });

  it("if the limit cannot be checked, nothing is written", async () => {
    const db = logDb([], {
      onQuery: (query) => (query.kind === "select" ? "XX000" : undefined),
    });
    await expect(
      recordSignInRefused("stranger@example.com", NOW, db.get)
    ).resolves.toBe(undefined);
    expect(db.log()).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("refused sign-in not recorded");
    expect(lines()).toContain("XX000");
    expect(lines()).not.toContain("stranger");
  });

  it("a very long address is cut before it is compared or stored", async () => {
    const db = logDb();
    const long = `${"a".repeat(5000)}@example.com`;
    await recordSignInRefused(long, NOW, db.get);
    await recordSignInRefused(long, NOW + MIN, db.get);
    expect(db.log()).toHaveLength(1);
    expect(db.log()[0].staff_email).toBe("a".repeat(SIGNIN_ADDRESS_MAX));
  });

  it("an account with no address is still a row", async () => {
    const db = logDb();
    await recordSignInRefused(null, NOW, db.get);
    await recordSignInRefused(undefined, NOW + MIN, db.get);
    expect(db.log()).toMatchObject([{ staff_email: NO_ADDRESS }]);
  });

  it("before migration 0022: resolves, one line with the code only", async () => {
    const db = logDb([], beforeMigration);
    await expect(
      recordSignInRefused("stranger@example.com", NOW, db.get)
    ).resolves.toBe(undefined);
    expect(db.log()).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(lines()).toContain("signin_refused");
    expect(lines()).toContain("23514");
    expect(lines()).not.toContain("stranger");
  });

  it("resolves when the database cannot be reached for, or never answers", async () => {
    await expect(
      recordSignInRefused("stranger@example.com", NOW, () => {
        throw new Error("no database");
      })
    ).resolves.toBe(undefined);

    vi.useFakeTimers();
    const never = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          gte: () => q,
          order: () => q,
          limit: () => new Promise(() => {}),
        };
        return q;
      },
    } as unknown as SupabaseClient;
    const done = recordSignInRefused("stranger@example.com", NOW, () => never);
    await vi.advanceTimersByTimeAsync(SIGNIN_LOG_TIMEOUT_MS);
    await expect(done).resolves.toBe(undefined);
    expect(lines()).not.toContain("stranger");
  });
});

describe("on the Log page", () => {
  it("the three rows read back like any other", async () => {
    const db = logDb();
    await recordSignIn("desk@example.com", db.get);
    await recordSignInRefused("stranger@example.com", NOW, db.get);
    await recordSignOut(
      { email: "desk@example.com", dayEnd: NOW + MIN },
      NOW,
      db.get
    );
    const page = await loadAuditPage(db.client, {});
    expect(
      page.entries.map((e) => [
        e.staffEmail,
        e.action,
        e.detail,
        e.patientCount,
      ])
    ).toEqual([
      ["desk@example.com", "staff_signout", null, 0],
      ["stranger@example.com", "signin_refused", "Not on the staff list", 0],
      ["desk@example.com", "staff_signin", null, 0],
    ]);
    // "Sign-in refused" as the kind of activity lists the strangers.
    expect(
      (
        await loadAuditPage(db.client, { action: "signin_refused" })
      ).entries.map((e) => e.staffEmail)
    ).toEqual(["stranger@example.com"]);
  });
});
