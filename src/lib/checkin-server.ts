// Writing a check-in: the one place a checkins row (= a visit on the
// rooms board) is created, whether the patient did it at the kiosk or
// staff did it for them from the dashboard.

import type { SupabaseClient } from "@supabase/supabase-js";
import { VISIT_ACTIVE_WINDOW_MS } from "./patient-flow";
import { fetchTodaySession, PbSessionInfo } from "./practice-better";
import { broadcastFlowUpdated } from "./rooms-realtime";

export type CheckinSource = "kiosk" | "staff";
export type CheckinOutcome = "created" | "duplicate" | "error";

const KIOSK_REPEAT_WINDOW_MS = 4 * 60 * 60 * 1000;

// Which earlier check-in makes a new one a repeat.
//
// - kiosk: any check-in in the last 4 hours, finished or not. A double
//   tap, or a PIN typed again on the way out, must not add a second row
//   (or put a finished patient back on the board); a genuine morning +
//   afternoon visit still gets two.
// - staff: only a visit that is still open — the patient is on the rooms
//   board right now. A finished or removed visit does not count: checking
//   the patient in again is how staff bring back someone who was taken
//   off the board by mistake, which the kiosk's rule would refuse for
//   four hours.
export function repeatRule(
  source: CheckinSource,
  nowMs: number
): { sinceIso: string; openOnly: boolean } {
  return source === "kiosk"
    ? {
        sinceIso: new Date(nowMs - KIOSK_REPEAT_WINDOW_MS).toISOString(),
        openOnly: false,
      }
    : {
        sinceIso: new Date(nowMs - VISIT_ACTIVE_WINDOW_MS).toISOString(),
        openOnly: true,
      };
}

interface CheckinDeps {
  fetchSession: (pbClientId: string) => Promise<PbSessionInfo | null>;
  announce: () => Promise<void>;
}

const liveDeps: CheckinDeps = {
  fetchSession: fetchTodaySession,
  announce: broadcastFlowUpdated,
};

// "created": a new row, and open boards were told to refetch.
// "duplicate": nothing written — see repeatRule.
// "error": the database refused (including an unknown patient id).
export async function createCheckin(
  supabase: SupabaseClient,
  patientId: string,
  source: CheckinSource,
  nowMs: number,
  deps: CheckinDeps = liveDeps
): Promise<CheckinOutcome> {
  const rule = repeatRule(source, nowMs);
  let recentQuery = supabase
    .from("checkins")
    .select("id")
    .eq("patient_id", patientId)
    .gte("checked_in_at", rule.sinceIso);
  if (rule.openOnly) recentQuery = recentQuery.is("done_at", null);
  const { data: recent, error: recentError } = await recentQuery.limit(1);
  if (recentError) return "error";
  if (recent && recent.length > 0) return "duplicate";

  // Snapshot today's appointment (time + service + doctor) from Practice
  // Better onto the row. The doctor drives the room tile's pill when
  // staff send this patient to a room. Fail open: a PB outage or a
  // walk-in with no session today still checks in, just with null
  // appointment fields.
  let appointment_at: string | null = null;
  let service_name: string | null = null;
  let practitioner_name: string | null = null;
  try {
    const { data: patientRow } = await supabase
      .from("patients")
      .select("pb_client_id")
      .eq("id", patientId)
      .single();
    if (patientRow?.pb_client_id) {
      const session = await deps.fetchSession(patientRow.pb_client_id);
      if (session) {
        appointment_at = new Date(session.sessionDate).toISOString();
        service_name = session.serviceName;
        practitioner_name = session.practitioner;
      }
    }
  } catch {
    // a check-in must never fail because the appointment lookup did
  }

  const { error } = await supabase.from("checkins").insert({
    patient_id: patientId,
    appointment_at,
    service_name,
    practitioner_name,
  });
  if (error) return "error";

  // The patient is now in the staff board's waiting list — nudge open
  // boards to refetch (empty hint, no patient data). Best effort.
  await deps.announce();
  return "created";
}
