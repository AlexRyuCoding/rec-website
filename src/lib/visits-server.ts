import type { SupabaseClient } from "@supabase/supabase-js";
import {
  displayName,
  FlowVisit,
  VISIT_ACTIVE_WINDOW_MS,
  VisitUpdate,
  VisitView,
} from "./patient-flow";

// Database access for the patient flow. The rules live in patient-flow.ts;
// this file only reads open visits and writes the updates those rules
// produce.

export interface VisitDbRow extends FlowVisit {
  appointment_at: string | null;
  patients: { first_name: string | null; last_name: string | null } | null;
}

const VISIT_COLUMNS =
  "id, checked_in_at, appointment_at, practitioner_name, room_id, room_assigned_at, called_at, seen_at, done_at, patients(first_name, last_name)";

// The shape sent to the staff board. The patient's full last name stops
// here: only "First L." goes out.
export function toVisitView(row: VisitDbRow): VisitView {
  return {
    id: row.id,
    display_name: displayName(
      row.patients?.first_name,
      row.patients?.last_name
    ),
    checked_in_at: row.checked_in_at,
    appointment_at: row.appointment_at,
    practitioner_name: row.practitioner_name,
    room_id: row.room_id,
    room_assigned_at: row.room_assigned_at,
    called_at: row.called_at,
    seen_at: row.seen_at,
  };
}

// Open visits inside the active window, oldest check-in first. Throws on
// a database error so each caller decides whether that is fatal.
export async function loadActiveVisits(
  supabase: SupabaseClient,
  nowMs: number
): Promise<VisitDbRow[]> {
  const cutoff = new Date(nowMs - VISIT_ACTIVE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("checkins")
    .select(VISIT_COLUMNS)
    .is("done_at", null)
    .gte("checked_in_at", cutoff)
    .order("checked_in_at");
  if (error) throw new Error("active visits fetch failed");
  return (data ?? []).map((row) => {
    // supabase-js types a to-one embed as an array; at runtime it is an
    // object. Accept both.
    const patients = Array.isArray(row.patients)
      ? (row.patients[0] ?? null)
      : (row.patients ?? null);
    return { ...row, patients } as VisitDbRow;
  });
}

// Returns false if any write failed. Never throws: a flow hiccup must not
// take a timer action or a check-in down with it.
export async function writeVisitUpdates(
  supabase: SupabaseClient,
  updates: VisitUpdate[]
): Promise<boolean> {
  let ok = true;
  for (const update of updates) {
    try {
      const { error } = await supabase
        .from("checkins")
        .update(update.fields)
        .eq("id", update.id);
      if (error) ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
}
