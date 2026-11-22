// The record of what staff did with patient data: who, when, what, and
// which patients (staff_audit_log, migration 0015; 'staff_checkin' needs
// 0016). Read it in the Supabase table editor — there is no page for it.

import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffAction = "patient_search" | "pin_reset" | "staff_checkin";

export interface StaffActionEntry {
  staffEmail: string;
  action: StaffAction;
  // The patients whose details were shown or changed.
  patientIds: string[];
  // For a search: the text that was typed.
  detail?: string;
}

const MAX_DETAIL_LENGTH = 200;

// Never throws and never blocks the action: if the row cannot be written
// (migration 0015 not applied, database hiccup) the front desk must still
// be able to find a patient and reset a PIN. The failure is logged — with
// the error code only, never the patient or the search text.
export async function recordStaffAction(
  supabase: SupabaseClient,
  entry: StaffActionEntry
): Promise<void> {
  try {
    const { error } = await supabase.from("staff_audit_log").insert({
      staff_email: entry.staffEmail.toLowerCase(),
      action: entry.action,
      patient_ids: entry.patientIds,
      detail: entry.detail?.slice(0, MAX_DETAIL_LENGTH) ?? null,
    });
    if (error) {
      console.error("audit log write failed:", entry.action, error.code);
    }
  } catch {
    console.error("audit log write failed:", entry.action, "exception");
  }
}
