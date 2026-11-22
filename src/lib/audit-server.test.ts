import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordStaffAction } from "./audit-server";

function fakeSupabase(error: { code: string } | null = null) {
  const inserts: { table: string; row: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: unknown) => {
        inserts.push({ table, row });
        return { error };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, inserts };
}

afterEach(() => vi.restoreAllMocks());

describe("recordStaffAction", () => {
  it("writes who did what to whom", async () => {
    const { client, inserts } = fakeSupabase();
    await recordStaffAction(client, {
      staffEmail: "Front.Desk@Example.com",
      action: "patient_search",
      patientIds: ["p1", "p2"],
      detail: "ann lic",
    });
    expect(inserts).toEqual([
      {
        table: "staff_audit_log",
        row: {
          staff_email: "front.desk@example.com",
          action: "patient_search",
          patient_ids: ["p1", "p2"],
          detail: "ann lic",
        },
      },
    ]);
  });

  it("stores no detail when there is none, and caps a long one", async () => {
    const { client, inserts } = fakeSupabase();
    await recordStaffAction(client, {
      staffEmail: "a@b.c",
      action: "pin_reset",
      patientIds: ["p1"],
    });
    await recordStaffAction(client, {
      staffEmail: "a@b.c",
      action: "patient_search",
      patientIds: [],
      detail: "x".repeat(500),
    });
    expect((inserts[0].row as { detail: unknown }).detail).toBeNull();
    expect((inserts[1].row as { detail: string }).detail).toHaveLength(200);
  });

  it("never stops the staff action when the write fails", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeSupabase({ code: "42P01" });
    await expect(
      recordStaffAction(client, {
        staffEmail: "a@b.c",
        action: "pin_reset",
        patientIds: ["p1"],
        detail: "Ann Licater",
      })
    ).resolves.toBeUndefined();
    // The log line says that it failed, and nothing about the patient.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("42P01");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Licater");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("p1");
  });

  it("survives a client that throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = {
      from: () => {
        throw new Error("network");
      },
    } as unknown as SupabaseClient;
    await expect(
      recordStaffAction(client, {
        staffEmail: "a@b.c",
        action: "pin_reset",
        patientIds: ["p1"],
      })
    ).resolves.toBeUndefined();
  });
});

// ---- writing once, and reading the log (migration 0019) -----------------

import { VIEW_REPEAT_MS } from "./audit-log";
import {
  AUDIT_PAGE_SIZE,
  loadAuditPage,
  recordStaffActionOnce,
} from "./audit-server";
import { fakeSupabase as memoryDb } from "./testing/fake-supabase";

const NOW = Date.parse("2026-11-23T20:00:00.000Z");

function logDb(rows: Record<string, unknown>[] = [], patients: object[] = []) {
  let nextId = rows.length;
  let clock = NOW;
  const db = memoryDb(
    { staff_audit_log: rows, patients },
    {
      onInsert: (_table, row) => {
        row.id = ++nextId;
        row.at = new Date(clock).toISOString();
      },
    }
  );
  return { ...db, setClock: (ms: number) => (clock = ms) };
}

const view = (detail = "2026-11-23") => ({
  staffEmail: "desk@example.com",
  action: "checkins_view" as const,
  patientIds: ["p1"],
  detail,
});

describe("recordStaffActionOnce", () => {
  it("writes the first view", async () => {
    const db = logDb();
    await recordStaffActionOnce(db.client, view(), NOW);
    expect(db.tables.staff_audit_log).toHaveLength(1);
  });

  it("does not write the same view again within fifteen minutes", async () => {
    const db = logDb();
    await recordStaffActionOnce(db.client, view(), NOW);
    await recordStaffActionOnce(db.client, view(), NOW + 60_000);
    await recordStaffActionOnce(db.client, view(), NOW + VIEW_REPEAT_MS - 1);
    expect(db.tables.staff_audit_log).toHaveLength(1);
  });

  it("writes it again once fifteen minutes have passed", async () => {
    const db = logDb();
    await recordStaffActionOnce(db.client, view(), NOW);
    db.setClock(NOW + VIEW_REPEAT_MS + 1000);
    await recordStaffActionOnce(db.client, view(), NOW + VIEW_REPEAT_MS + 1000);
    expect(db.tables.staff_audit_log).toHaveLength(2);
  });

  it("other dates, another person or another action are their own rows", async () => {
    const db = logDb();
    await recordStaffActionOnce(db.client, view(), NOW);
    await recordStaffActionOnce(db.client, view("2026-11-22"), NOW);
    await recordStaffActionOnce(
      db.client,
      { ...view(), staffEmail: "doctor@example.com" },
      NOW
    );
    await recordStaffActionOnce(
      db.client,
      { ...view(), action: "checkins_export" },
      NOW
    );
    expect(db.tables.staff_audit_log).toHaveLength(4);
  });

  it("writes when it cannot look back — one too many is better than none", async () => {
    const db = memoryDb(
      { staff_audit_log: [] },
      { onQuery: (query) => (query.kind === "select" ? "XX000" : undefined) }
    );
    await recordStaffActionOnce(db.client, view(), NOW);
    expect(db.tables.staff_audit_log).toHaveLength(1);
  });
});

describe("loadAuditPage", () => {
  const at = (minutesAgo: number) =>
    new Date(NOW - minutesAgo * 60_000).toISOString();
  const patients = [
    { id: "p1", first_name: "Ann", last_name: "Licater" },
    { id: "p2", first_name: "Bob", last_name: "Stone" },
    { id: "p3", first_name: "Cy", last_name: "Diaz" },
    { id: "p4", first_name: "Di", last_name: "Park" },
  ];
  const rows = [
    {
      id: 1,
      at: at(50),
      staff_email: "desk@example.com",
      action: "patient_search",
      patient_ids: ["p1", "p2"],
      detail: "ann",
    },
    {
      id: 2,
      at: at(40),
      staff_email: "desk@example.com",
      action: "pin_reset",
      patient_ids: ["p1"],
      detail: null,
    },
    {
      id: 3,
      at: at(30),
      staff_email: "doctor@example.com",
      action: "checkins_view",
      patient_ids: ["p2", "p3", "p4", "p1"],
      detail: "2026-11-23",
    },
    {
      id: 4,
      at: at(20),
      staff_email: "desk@example.com",
      action: "visit_remove",
      patient_ids: ["gone"],
      detail: "from Room 3",
    },
    {
      id: 5,
      at: at(10),
      staff_email: "desk@example.com",
      action: "device_pair",
      patient_ids: [],
      detail: "Check-in kiosk: Front desk iPad",
    },
  ];

  it("lists the log newest first, with who, what and whom", async () => {
    const db = logDb(rows, patients);
    const page = await loadAuditPage(db.client, {});
    expect(page.more).toBe(false);
    expect(page.entries.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
    expect(page.entries[4]).toEqual({
      id: 1,
      at: at(50),
      staffEmail: "desk@example.com",
      action: "patient_search",
      detail: "ann",
      patientCount: 2,
      patientNames: ["Ann Licater", "Bob Stone"],
    });
  });

  it("names the first three patients of a long row and counts them all", async () => {
    const db = logDb(rows, patients);
    const entry = (await loadAuditPage(db.client, {})).entries.find(
      (e) => e.id === 3
    )!;
    expect(entry.patientCount).toBe(4);
    expect(entry.patientNames).toEqual(["Bob Stone", "Cy Diaz", "Di Park"]);
  });

  it("keeps a row whose patient record is gone, without a name", async () => {
    const db = logDb(rows, patients);
    const entry = (await loadAuditPage(db.client, {})).entries.find(
      (e) => e.id === 4
    )!;
    expect(entry).toMatchObject({ patientCount: 1, patientNames: [] });
  });

  it("filters to one patient, and shows that patient first", async () => {
    const db = logDb(rows, patients);
    const page = await loadAuditPage(db.client, { patientId: "p1" });
    expect(page.entries.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(page.entries[0].patientNames[0]).toBe("Ann Licater");
  });

  it("filters by action and by staff member", async () => {
    const db = logDb(rows, patients);
    expect(
      (await loadAuditPage(db.client, { action: "pin_reset" })).entries.map(
        (e) => e.id
      )
    ).toEqual([2]);
    expect(
      (
        await loadAuditPage(db.client, { staffEmail: "Doctor@Example.com" })
      ).entries.map((e) => e.id)
    ).toEqual([3]);
  });

  it("pages: a hundred at a time, older rows after the last one shown", async () => {
    const many = Array.from({ length: AUDIT_PAGE_SIZE + 30 }, (_, i) => ({
      id: i + 1,
      at: at(1000 - i),
      staff_email: "desk@example.com",
      action: "patient_search",
      patient_ids: [],
      detail: `q${i + 1}`,
    }));
    const db = logDb(many, []);
    const first = await loadAuditPage(db.client, {});
    expect(first.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.more).toBe(true);
    const last = first.entries[first.entries.length - 1].id;
    const second = await loadAuditPage(db.client, { beforeId: last });
    expect(second.entries).toHaveLength(30);
    expect(second.more).toBe(false);
    expect(second.entries[0].id).toBe(last - 1);
  });

  it("still lists the log when the names cannot be looked up", async () => {
    const db = memoryDb(
      { staff_audit_log: rows, patients },
      { onQuery: (query) => (query.table === "patients" ? "XX000" : undefined) }
    );
    const page = await loadAuditPage(db.client, {});
    expect(page.entries).toHaveLength(5);
    expect(page.entries.every((e) => e.patientNames.length === 0)).toBe(true);
  });

  it("throws when the log itself cannot be read", async () => {
    const db = memoryDb({ staff_audit_log: [] }, { onQuery: () => "XX000" });
    await expect(loadAuditPage(db.client, {})).rejects.toThrow();
  });
});
