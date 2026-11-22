import { describe, expect, it } from "vitest";
import {
  loadFinishedVisits,
  toVisitView,
  toVisitViews,
  VisitDbRow,
} from "./visits-server";
import { fakeSupabase } from "./testing/fake-supabase";

const row = (overrides: Partial<VisitDbRow> = {}): VisitDbRow => ({
  id: "v1",
  checked_in_at: "2026-11-19T18:00:00.000Z",
  appointment_at: "2026-11-19T18:30:00.000Z",
  practitioner_name: "Alex Ryu",
  room_id: "r1",
  room_assigned_at: "2026-11-19T18:05:00.000Z",
  called_at: "2026-11-19T18:05:00.000Z",
  seen_at: null,
  done_at: null,
  patients: { first_name: "Maria", last_name: "Santos" },
  ...overrides,
});

describe("toVisitView", () => {
  it("reduces the patient to first name and last initial", () => {
    expect(toVisitView(row())).toEqual({
      id: "v1",
      display_name: "Maria S.",
      checked_in_at: "2026-11-19T18:00:00.000Z",
      appointment_at: "2026-11-19T18:30:00.000Z",
      service_name: null,
      first_visit: false,
      practitioner_name: "Alex Ryu",
      room_id: "r1",
      room_assigned_at: "2026-11-19T18:05:00.000Z",
      called_at: "2026-11-19T18:05:00.000Z",
      seen_at: null,
    });
  });

  it("carries the service, for the staff board", () => {
    expect(
      toVisitView(row({ service_name: "Fire cupping" })).service_name
    ).toBe("Fire cupping");
  });

  it("never carries the full last name or the patient record", () => {
    const view = toVisitView(row());
    expect(JSON.stringify(view)).not.toContain("Santos");
    expect(view).not.toHaveProperty("patients");
    expect(view).not.toHaveProperty("done_at");
  });

  it("still lists a walk-in with no appointment, doctor or patient row", () => {
    const view = toVisitView(
      row({
        appointment_at: null,
        practitioner_name: null,
        room_id: null,
        room_assigned_at: null,
        called_at: null,
        patients: null,
      })
    );
    expect(view).toMatchObject({
      id: "v1",
      display_name: "Guest",
      appointment_at: null,
      practitioner_name: null,
      room_id: null,
    });
  });
});

describe("toVisitViews (first visit)", () => {
  const NOW = Date.parse("2026-11-19T18:10:00.000Z");
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  const visitOf = (id: string, patientId: string, recordAgeDays: number) =>
    row({
      id,
      patient_id: patientId,
      patients: {
        first_name: "Maria",
        last_name: "Santos",
        created_at: daysAgo(recordAgeDays),
      },
    });

  it("marks a new patient's first check-in", async () => {
    const visit = visitOf("v1", "p1", 2);
    const db = fakeSupabase({
      checkins: [{ patient_id: "p1", checked_in_at: visit.checked_in_at }],
    });
    const [view] = await toVisitViews(db.client, [visit], NOW);
    expect(view.first_visit).toBe(true);
  });

  it("does not mark a new patient who has been in before", async () => {
    const visit = visitOf("v1", "p1", 20);
    const db = fakeSupabase({
      checkins: [
        { patient_id: "p1", checked_in_at: daysAgo(7) },
        { patient_id: "p1", checked_in_at: visit.checked_in_at },
      ],
    });
    const [view] = await toVisitViews(db.client, [visit], NOW);
    expect(view.first_visit).toBe(false);
  });

  it("asks the database nothing when nobody's record is new", async () => {
    const db = fakeSupabase({ checkins: [] });
    const [view] = await toVisitViews(
      db.client,
      [visitOf("v1", "p1", 500)],
      NOW
    );
    expect(view.first_visit).toBe(false);
    expect(db.queries).toHaveLength(0);
  });

  it("still returns the list when the history cannot be read", async () => {
    const db = fakeSupabase({ checkins: [] }, { onQuery: () => "XX000" });
    const views = await toVisitViews(db.client, [visitOf("v1", "p1", 2)], NOW);
    expect(views).toHaveLength(1);
    expect(views[0].first_visit).toBe(false);
  });
});

describe("loadFinishedVisits", () => {
  const NOW = Date.parse("2026-11-19T20:00:00.000Z");
  const at = (minutesAgo: number) =>
    new Date(NOW - minutesAgo * 60_000).toISOString();
  const checkin = (id: string, o: Partial<VisitDbRow> = {}) =>
    row({ id, checked_in_at: at(90), done_at: at(10), ...o });

  it("lists visits that ended today, newest first, as 'First L.' only", async () => {
    const db = fakeSupabase({
      checkins: [
        checkin("old", { done_at: at(60) }),
        checkin("new", { done_at: at(5), service_name: "Cupping" }),
        checkin("open", { done_at: null }),
        checkin("yesterday", {
          checked_in_at: at(20 * 60),
          done_at: at(19 * 60),
        }),
      ],
    });
    const finished = await loadFinishedVisits(db.client, NOW);
    expect(finished.map((f) => f.id)).toEqual(["new", "old"]);
    expect(finished[0]).toEqual({
      id: "new",
      display_name: "Maria S.",
      service_name: "Cupping",
      checked_in_at: at(90),
      room_id: "r1",
      called_at: "2026-11-19T18:05:00.000Z",
      done_at: at(5),
    });
    expect(JSON.stringify(finished)).not.toContain("Santos");
  });

  it("throws when the list cannot be read", async () => {
    const db = fakeSupabase({ checkins: [] }, { onQuery: () => "XX000" });
    await expect(loadFinishedVisits(db.client, NOW)).rejects.toThrow();
  });
});
