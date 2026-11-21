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
