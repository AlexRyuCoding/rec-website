// The Log tab's route with sign-in rows in the table: who is offered in
// the "Staff member" filter, and that the new kinds of activity can be
// asked for. Against the in-memory database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./testing/fake-supabase";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => (db.current as { client: unknown }).client,
}));
vi.mock("@/lib/admin-auth", () => ({
  getAdminEmail: async () => "desk@example.com",
  isAdminAuthorized: async () => true,
}));

import { GET } from "@/app/api/admin/audit/route";

const row = (
  id: number,
  staff_email: string,
  action: string,
  detail: string | null = null
) => ({
  id,
  at: new Date(
    Date.parse("2026-11-23T17:00:00.000Z") + id * 60_000
  ).toISOString(),
  staff_email,
  action,
  patient_ids: [],
  detail,
});

const rows = [
  row(1, "desk@example.com", "staff_signin"),
  row(2, "stranger@example.com", "signin_refused", "Not on the staff list"),
  row(3, "doctor@example.com", "staff_signin"),
  row(4, "desk@example.com", "patient_search", "ann"),
  row(5, "<b>odd</b>@example.com", "signin_refused", "Not on the staff list"),
  // Someone who was staff last month and is no longer on the list.
  row(6, "former@example.com", "signin_refused", "Not on the staff list"),
  row(7, "desk@example.com", "staff_signout"),
];

async function ask(query = "") {
  const res = await GET(
    new NextRequest(`http://localhost/api/admin/audit${query}`),
    { params: Promise.resolve({}) }
  );
  return {
    status: res.status,
    body: (await res.json()) as {
      entries: { id: number; staffEmail: string; action: string }[];
      staff: string[];
    },
  };
}

beforeEach(() => {
  vi.stubEnv("ALLOWED_ADMIN_EMAILS", "doctor@example.com, Desk@Example.com");
  db.current = fakeSupabase({ staff_audit_log: rows, patients: [] });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/audit with sign-in rows", () => {
  it("lists them with everything else, newest first", async () => {
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body.entries.map((e) => e.id)).toEqual([7, 6, 5, 4, 3, 2, 1]);
  });

  it("offers only the staff list in the staff filter — never an address that was refused", async () => {
    const { body } = await ask();
    expect(body.staff).toEqual(["desk@example.com", "doctor@example.com"]);
    for (const query of ["?action=signin_refused", "?staff=desk@example.com"]) {
      expect((await ask(query)).body.staff).toEqual([
        "desk@example.com",
        "doctor@example.com",
      ]);
    }
  });

  it("'Sign-in refused' as the kind of activity is how the strangers are found", async () => {
    const { body } = await ask("?action=signin_refused");
    expect(body.entries.map((e) => e.staffEmail)).toEqual([
      "former@example.com",
      "<b>odd</b>@example.com",
      "stranger@example.com",
    ]);
  });

  it("the other two kinds can be asked for too", async () => {
    expect(
      (await ask("?action=staff_signin")).body.entries.map((e) => e.id)
    ).toEqual([3, 1]);
    expect(
      (await ask("?action=staff_signout")).body.entries.map((e) => e.id)
    ).toEqual([7]);
  });

  it("a staff member's filter shows their own sign-ins and nobody's refusals", async () => {
    const { body } = await ask("?staff=desk@example.com");
    expect(body.entries.map((e) => [e.id, e.action])).toEqual([
      [7, "staff_signout"],
      [4, "patient_search"],
      [1, "staff_signin"],
    ]);
  });
});
