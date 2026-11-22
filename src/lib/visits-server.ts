import type { SupabaseClient } from "@supabase/supabase-js";
import {
  displayName,
  FinishedVisitView,
  firstVisitCandidates,
  firstVisitIds,
  FlowVisit,
  VISIT_ACTIVE_WINDOW_MS,
  VisitUpdate,
  VisitView,
} from "./patient-flow";
import type { RoomRow } from "./room-status";

// Database access for the patient flow. The rules live in patient-flow.ts;
// this file only reads open visits and writes the updates those rules
// produce.

export interface VisitDbRow extends FlowVisit {
  appointment_at: string | null;
  service_name?: string | null;
  patient_id?: string | null;
  patients: {
    first_name: string | null;
    last_name: string | null;
    created_at?: string | null;
  } | null;
}

const VISIT_COLUMNS =
  "id, patient_id, checked_in_at, appointment_at, service_name, practitioner_name, room_id, room_assigned_at, called_at, seen_at, done_at, patients(first_name, last_name, created_at)";

// How many finished visits the board lists. A day is rarely more.
const FINISHED_LIMIT = 60;

// The shape sent to the staff board. The patient's full last name stops
// here: only "First L." goes out.
export function toVisitView(row: VisitDbRow, firstVisit = false): VisitView {
  return {
    id: row.id,
    display_name: displayName(
      row.patients?.first_name,
      row.patients?.last_name
    ),
    checked_in_at: row.checked_in_at,
    appointment_at: row.appointment_at,
    service_name: row.service_name ?? null,
    first_visit: firstVisit,
    practitioner_name: row.practitioner_name,
    room_id: row.room_id,
    room_assigned_at: row.room_assigned_at,
    called_at: row.called_at,
    seen_at: row.seen_at,
  };
}

// The board's list, with "First visit" worked out (rule: firstVisitIds).
// Usually no extra query at all: history is only looked up for patients
// whose record is new. If that lookup fails nobody is marked — the board
// must not lose its list over a badge.
export async function toVisitViews(
  supabase: SupabaseClient,
  rows: VisitDbRow[],
  nowMs: number
): Promise<VisitView[]> {
  const inputs = rows.map((row) => ({
    id: row.id,
    patient_id: row.patient_id ?? null,
    checked_in_at: row.checked_in_at,
    patient_created_at: row.patients?.created_at ?? null,
  }));
  let first = new Set<string>();
  const candidates = firstVisitCandidates(inputs, nowMs);
  if (candidates.length > 0) {
    try {
      const { data, error } = await supabase
        .from("checkins")
        .select("patient_id, checked_in_at")
        .in("patient_id", candidates)
        .order("checked_in_at")
        .limit(500);
      if (!error) first = firstVisitIds(inputs, data ?? [], nowMs);
    } catch {
      // no badges
    }
  }
  return rows.map((row) => toVisitView(row, first.has(row.id)));
}

function onePatient(row: { patients?: unknown }): VisitDbRow["patients"] {
  // supabase-js types a to-one embed as an array; at runtime it is an
  // object. Accept both.
  const patients = row.patients;
  return (
    Array.isArray(patients) ? (patients[0] ?? null) : (patients ?? null)
  ) as VisitDbRow["patients"];
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
  return (data ?? []).map(
    (row) => ({ ...row, patients: onePatient(row) }) as VisitDbRow
  );
}

// One finished visit inside the active window, for "Restore". Null if
// there is no such visit; throws on a database error.
export async function loadFinishedVisit(
  supabase: SupabaseClient,
  visitId: string,
  nowMs: number
): Promise<VisitDbRow | null> {
  const cutoff = new Date(nowMs - VISIT_ACTIVE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("checkins")
    .select(VISIT_COLUMNS)
    .eq("id", visitId)
    .not("done_at", "is", null)
    .gte("checked_in_at", cutoff)
    .maybeSingle();
  if (error) throw new Error("finished visit fetch failed");
  return data ? ({ ...data, patients: onePatient(data) } as VisitDbRow) : null;
}

// Visits that ended inside the active window, most recent first — the
// board's "Finished" list. Throws on a database error.
export async function loadFinishedVisits(
  supabase: SupabaseClient,
  nowMs: number
): Promise<FinishedVisitView[]> {
  const cutoff = new Date(nowMs - VISIT_ACTIVE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("checkins")
    .select(VISIT_COLUMNS)
    .not("done_at", "is", null)
    .gte("checked_in_at", cutoff)
    .order("done_at", { ascending: false })
    .limit(FINISHED_LIMIT);
  if (error) throw new Error("finished visits fetch failed");
  return (data ?? []).map((row) => {
    const patients = onePatient(row);
    return {
      id: row.id,
      display_name: displayName(patients?.first_name, patients?.last_name),
      service_name: row.service_name ?? null,
      checked_in_at: row.checked_in_at,
      room_id: row.room_id,
      called_at: row.called_at,
      done_at: row.done_at,
    };
  });
}

// A rooms-board action as the database is asked to apply it: changes to
// visits and, for a timer action, to the room it belongs to.
export interface FlowChange {
  updates: VisitUpdate[];
  room?: { id: string; fields: Partial<RoomRow> };
}

// PostgREST when it does not know the function / Postgres when it is
// not there.
const functionMissing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

// Writes a whole action at once: every row changes or none does (the
// apply_flow_change database function, migration 0021 — one
// transaction). Returns the room after the change when one was given.
// Never throws.
//
// "Room ready" on a couple with someone lined up is three visits and a
// room. Sent as separate writes, a dropped connection in between left
// the board half-changed: one of the couple finished and the other not.
//
// The one fallback: if the function does not exist yet, the rows are
// written one by one as before. That is for the minutes between a deploy
// and its migration — a rooms board that cannot send anyone to a room is
// worse than one that is not atomic yet. Any OTHER failure is a failure.
export async function applyFlowChange(
  supabase: SupabaseClient,
  change: FlowChange
): Promise<{ ok: true; room: RoomRow | null } | { ok: false }> {
  if (change.updates.length === 0 && !change.room) {
    return { ok: true, room: null };
  }
  try {
    const { data, error } = await supabase.rpc("apply_flow_change", {
      visit_updates: change.updates,
      target_room: change.room?.id ?? null,
      room_fields: change.room?.fields ?? null,
    });
    if (!error) return { ok: true, room: (data as RoomRow | null) ?? null };
    if (!functionMissing(error.code)) return { ok: false };
  } catch {
    return { ok: false };
  }

  console.warn("apply_flow_change is missing (migration 0021): row-by-row");
  try {
    let room: RoomRow | null = null;
    if (change.room) {
      const { data, error } = await supabase
        .from("rooms")
        .update({
          ...change.room.fields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", change.room.id)
        .select("*")
        .single();
      if (error) return { ok: false };
      room = data as RoomRow;
    }
    let ok = true;
    for (const update of change.updates) {
      const { error } = await supabase
        .from("checkins")
        .update(update.fields)
        .eq("id", update.id);
      if (error) ok = false;
    }
    return ok ? { ok: true, room } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// Visit changes only. Returns false if they could not be written — and
// then none of them was.
export async function writeVisitUpdates(
  supabase: SupabaseClient,
  updates: VisitUpdate[]
): Promise<boolean> {
  return (await applyFlowChange(supabase, { updates })).ok;
}
