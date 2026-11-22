import { describe, expect, it } from "vitest";
import {
  CHECKIN_PAGE_SIZE,
  loadCheckinPage,
  loadCheckinTimings,
} from "./checkins-server";
import { fakeSupabase } from "./testing/fake-supabase";

const DAY = Date.parse("2026-11-23T08:00:00.000Z");
const at = (minutes: number) => new Date(DAY + minutes * 60_000).toISOString();
const FROM = at(0);
const TO = at(24 * 60);

const checkin = (n: number, o: Record<string, unknown> = {}) => ({
  id: `c${n}`,
  checked_in_at: at(n),
  appointment_at: null,
  service_name: null,
  practitioner_name: "Alex Ryu",
  room_id: null,
  called_at: null,
  seen_at: null,
  done_at: null,
  patients: { first_name: "Pat", last_name: `Number${n}` },
  rooms: null,
  ...o,
});

describe("loadCheckinPage", () => {
  it("returns the range newest first, with name, room and where the visit stands", async () => {
    const db = fakeSupabase({
      checkins: [
        checkin(10),
        checkin(30, {
          service_name: "Cupping",
          room_id: "r3",
          rooms: { name: "Room 3" },
          called_at: at(36),
          seen_at: at(40),
        }),
        checkin(-60), // before the range
        checkin(24 * 60 + 5), // after it
      ],
    });
    const page = await loadCheckinPage(db.client, FROM, TO, 0);
    expect(page.total).toBe(2);
    expect(page.more).toBe(false);
    expect(page.checkins.map((c) => c.id)).toEqual(["c30", "c10"]);
    expect(page.checkins[0]).toEqual({
      id: "c30",
      checked_in_at: at(30),
      appointment_at: null,
      service_name: "Cupping",
      practitioner_name: "Alex Ryu",
      room_id: "r3",
      room_name: "Room 3",
      called_at: at(36),
      seen_at: at(40),
      done_at: null,
      first_name: "Pat",
      last_name: "Number30",
    });
  });

  it("pages through a long range without losing or repeating anyone", async () => {
    const all = Array.from({ length: CHECKIN_PAGE_SIZE + 40 }, (_, i) =>
      checkin(i + 1)
    );
    const db = fakeSupabase({ checkins: all });
    const first = await loadCheckinPage(db.client, FROM, TO, 0);
    expect(first.checkins).toHaveLength(CHECKIN_PAGE_SIZE);
    expect(first.total).toBe(CHECKIN_PAGE_SIZE + 40);
    expect(first.more).toBe(true);
    const second = await loadCheckinPage(
      db.client,
      FROM,
      TO,
      CHECKIN_PAGE_SIZE
    );
    expect(second.checkins).toHaveLength(40);
    expect(second.more).toBe(false);
    const ids = new Set(
      [...first.checkins, ...second.checkins].map((c) => c.id)
    );
    expect(ids.size).toBe(CHECKIN_PAGE_SIZE + 40);
  });

  it("reports whose check-ins the page lists, each patient once", async () => {
    const db = fakeSupabase({
      checkins: [
        checkin(10, { patient_id: "p1" }),
        checkin(20, { patient_id: "p2" }),
        checkin(30, { patient_id: "p1" }),
        checkin(40, { patient_id: null }),
      ],
    });
    const page = await loadCheckinPage(db.client, FROM, TO, 0);
    expect([...page.patientIds].sort()).toEqual(["p1", "p2"]);
    // ids are for the audit log; they are not part of a row sent out
    expect(page.checkins[0]).not.toHaveProperty("patient_id");
  });

  it("keeps a check-in whose patient or room row is gone", async () => {
    const db = fakeSupabase({
      checkins: [checkin(5, { patients: null, room_id: "gone", rooms: null })],
    });
    const page = await loadCheckinPage(db.client, FROM, TO, 0);
    expect(page.checkins[0]).toMatchObject({
      first_name: "",
      last_name: "",
      room_name: null,
    });
  });

  it("throws when the check-ins cannot be read", async () => {
    const db = fakeSupabase({ checkins: [] }, { onQuery: () => "XX000" });
    await expect(loadCheckinPage(db.client, FROM, TO, 0)).rejects.toThrow();
  });
});

describe("loadCheckinTimings", () => {
  it("reads every check-in of the range, however many", async () => {
    const all = Array.from({ length: 2300 }, (_, i) => checkin(i % 1400));
    const db = fakeSupabase({ checkins: all });
    const timings = await loadCheckinTimings(db.client, FROM, TO);
    expect(timings.rows).toHaveLength(2300);
    expect(timings.complete).toBe(true);
    expect(db.queries).toHaveLength(3);
  });

  it("asks for timestamps only — no names", async () => {
    const db = fakeSupabase({ checkins: [checkin(1)] });
    await loadCheckinTimings(db.client, FROM, TO);
    expect(db.queries[0].columns).not.toContain("patients");
    expect(db.queries[0].columns).toEqual(
      expect.arrayContaining([
        "checked_in_at",
        "called_at",
        "seen_at",
        "done_at",
      ])
    );
  });
});
