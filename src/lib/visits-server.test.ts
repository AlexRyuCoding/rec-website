import { describe, expect, it } from "vitest";
import { toVisitView, VisitDbRow } from "./visits-server";

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
      practitioner_name: "Alex Ryu",
      room_id: "r1",
      room_assigned_at: "2026-11-19T18:05:00.000Z",
      called_at: "2026-11-19T18:05:00.000Z",
      seen_at: null,
    });
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
