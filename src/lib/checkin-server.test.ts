import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCheckin, repeatRule } from "./checkin-server";

const NOW = Date.parse("2026-11-23T20:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

type Result = { data?: unknown; error?: { code: string } | null };

// A stand-in for the Supabase client: every query records the table and
// the calls chained onto it, and resolves with a canned answer.
function fakeDb(answers: {
  recent?: Result;
  patient?: Result;
  inserts?: Result[];
}) {
  const queries: { table: string; ops: [string, unknown[]][] }[] = [];
  const insertAnswers = [...(answers.inserts ?? [{ error: null }])];
  const from = (table: string) => {
    const query = { table, ops: [] as [string, unknown[]][] };
    queries.push(query);
    const answer = (): Result => {
      if (query.ops[0]?.[0] === "insert") {
        return insertAnswers.shift() ?? { error: null };
      }
      if (table === "patients") {
        return answers.patient ?? { data: { pb_client_id: "pb-1" } };
      }
      return answers.recent ?? { data: [], error: null };
    };
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (
              resolve: (value: Result) => unknown,
              reject: (reason: unknown) => unknown
            ) => Promise.resolve(answer()).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            query.ops.push([prop, args]);
            return chain;
          };
        },
      }
    );
    return chain;
  };
  const inserted = () =>
    queries
      .filter((q) => q.ops[0]?.[0] === "insert")
      .map((q) => q.ops[0][1][0]);
  return {
    client: { from } as unknown as SupabaseClient,
    queries,
    inserted,
  };
}

function fakeDeps(session: Awaited<ReturnType<Deps["fetchSession"]>> = null) {
  const calls = { announced: 0 };
  const deps: Deps = {
    fetchSession: async () => session,
    announce: async () => {
      calls.announced++;
    },
  };
  return { deps, calls };
}
type Deps = NonNullable<Parameters<typeof createCheckin>[4]>;

describe("repeatRule", () => {
  it("kiosk: any check-in in the last four hours is a repeat", () => {
    expect(repeatRule("kiosk", NOW)).toEqual({
      sinceIso: hoursAgo(4),
      openOnly: false,
    });
  });

  it("staff: only a visit still open on the board is a repeat", () => {
    expect(repeatRule("staff", NOW)).toEqual({
      sinceIso: hoursAgo(12),
      openOnly: true,
    });
  });
});

describe("createCheckin", () => {
  it("writes the visit with today's appointment and tells the boards", async () => {
    const db = fakeDb({});
    const { deps, calls } = fakeDeps({
      sessionDate: "2026-11-23T12:30:00-08:00",
      practitioner: "Alex Ryu",
      serviceName: "Acupuncture",
    });
    expect(await createCheckin(db.client, "p1", "kiosk", NOW, deps)).toBe(
      "created"
    );
    expect(db.inserted()).toEqual([
      {
        patient_id: "p1",
        appointment_at: "2026-11-23T20:30:00.000Z",
        service_name: "Acupuncture",
        practitioner_name: "Alex Ryu",
      },
    ]);
    expect(calls.announced).toBe(1);
  });

  it("a walk-in with no appointment today still checks in", async () => {
    const db = fakeDb({});
    const { deps } = fakeDeps(null);
    expect(await createCheckin(db.client, "p1", "staff", NOW, deps)).toBe(
      "created"
    );
    expect(db.inserted()).toEqual([
      {
        patient_id: "p1",
        appointment_at: null,
        service_name: null,
        practitioner_name: null,
      },
    ]);
  });

  it("checks in even when Practice Better cannot be reached", async () => {
    const db = fakeDb({});
    const { deps, calls } = fakeDeps();
    deps.fetchSession = async () => {
      throw new Error("PB down");
    };
    expect(await createCheckin(db.client, "p1", "kiosk", NOW, deps)).toBe(
      "created"
    );
    expect(calls.announced).toBe(1);
  });

  it("a repeat writes nothing and announces nothing", async () => {
    const db = fakeDb({ recent: { data: [{ id: "c1" }], error: null } });
    const { deps, calls } = fakeDeps();
    expect(await createCheckin(db.client, "p1", "kiosk", NOW, deps)).toBe(
      "duplicate"
    );
    expect(db.inserted()).toEqual([]);
    expect(calls.announced).toBe(0);
  });

  it("kiosk looks at every check-in of the last four hours", async () => {
    const db = fakeDb({});
    await createCheckin(db.client, "p1", "kiosk", NOW, fakeDeps().deps);
    expect(db.queries[0]).toEqual({
      table: "checkins",
      ops: [
        ["select", ["id"]],
        ["eq", ["patient_id", "p1"]],
        ["gte", ["checked_in_at", hoursAgo(4)]],
        ["limit", [1]],
      ],
    });
  });

  it("staff looks only at visits that are still open", async () => {
    const db = fakeDb({});
    await createCheckin(db.client, "p1", "staff", NOW, fakeDeps().deps);
    expect(db.queries[0]).toEqual({
      table: "checkins",
      ops: [
        ["select", ["id"]],
        ["eq", ["patient_id", "p1"]],
        ["gte", ["checked_in_at", hoursAgo(12)]],
        ["is", ["done_at", null]],
        ["limit", [1]],
      ],
    });
  });

  it("fails without writing when the repeat check cannot be made", async () => {
    const db = fakeDb({ recent: { data: null, error: { code: "XX000" } } });
    const { deps, calls } = fakeDeps();
    expect(await createCheckin(db.client, "p1", "staff", NOW, deps)).toBe(
      "error"
    );
    expect(db.inserted()).toEqual([]);
    expect(calls.announced).toBe(0);
  });

  it("falls back to the original columns if the full row is refused", async () => {
    const db = fakeDb({
      inserts: [{ error: { code: "42703" } }, { error: null }],
    });
    const { deps, calls } = fakeDeps();
    expect(await createCheckin(db.client, "p1", "kiosk", NOW, deps)).toBe(
      "created"
    );
    expect(db.inserted()[1]).toEqual({
      patient_id: "p1",
      appointment_at: null,
      service_name: null,
    });
    expect(calls.announced).toBe(1);
  });

  it("reports an error when the row cannot be written at all", async () => {
    const db = fakeDb({
      inserts: [{ error: { code: "23503" } }, { error: { code: "23503" } }],
    });
    const { deps, calls } = fakeDeps();
    expect(await createCheckin(db.client, "nobody", "staff", NOW, deps)).toBe(
      "error"
    );
    expect(calls.announced).toBe(0);
  });
});
