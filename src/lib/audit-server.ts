// The record of what staff did with patient data: who, when, what, and
// which patients (staff_audit_log — migration 0015; later actions need
// 0016 and 0019). Read on the dashboard's Log tab (loadAuditPage). What
// the actions are and what they are called: audit-log.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuditEntryView,
  isStaffAction,
  StaffAction,
  VIEW_REPEAT_MS,
} from "./audit-log";

export type { StaffAction };

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

// The same, at most once per VIEW_REPEAT_MS for the same person, action
// and detail — for a view that repeats by itself (the check-ins list
// refreshes every minute). If the look-back cannot be made, the row is
// written: one too many is better than none.
export async function recordStaffActionOnce(
  supabase: SupabaseClient,
  entry: StaffActionEntry,
  nowMs: number
): Promise<void> {
  try {
    const since = new Date(nowMs - VIEW_REPEAT_MS).toISOString();
    const { data, error } = await supabase
      .from("staff_audit_log")
      .select("id")
      .eq("staff_email", entry.staffEmail.toLowerCase())
      .eq("action", entry.action)
      .eq("detail", entry.detail?.slice(0, MAX_DETAIL_LENGTH) ?? "")
      .gte("at", since)
      .limit(1);
    if (!error && data && data.length > 0) return;
  } catch {
    // fall through and write
  }
  await recordStaffAction(supabase, entry);
}

// Rows per page of the Log tab.
export const AUDIT_PAGE_SIZE = 100;
// How many patients of a row are shown by name.
const NAMES_PER_ROW = 3;

export interface AuditFilters {
  action?: StaffAction;
  staffEmail?: string;
  // Only rows that name this patient.
  patientId?: string;
  // Only rows older than this one (the last id of the page before).
  beforeId?: number;
}

interface AuditRow {
  id: number;
  at: string;
  staff_email: string;
  action: string;
  patient_ids: string[] | null;
  detail: string | null;
}

// One page of the log, newest first, with the first few patients of each
// row by name. `more` = there are older rows. Throws on a database error.
export async function loadAuditPage(
  supabase: SupabaseClient,
  filters: AuditFilters
): Promise<{ entries: AuditEntryView[]; more: boolean }> {
  let query = supabase
    .from("staff_audit_log")
    .select("id, at, staff_email, action, patient_ids, detail");
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.staffEmail) {
    query = query.eq("staff_email", filters.staffEmail.toLowerCase());
  }
  if (filters.patientId) {
    query = query.contains("patient_ids", [filters.patientId]);
  }
  if (filters.beforeId !== undefined) query = query.lt("id", filters.beforeId);
  // One more than a page, to know whether there is a next one.
  const { data, error } = await query
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_SIZE + 1);
  if (error) throw new Error("audit log fetch failed");

  const rows = ((data ?? []) as AuditRow[]).slice(0, AUDIT_PAGE_SIZE);
  const more = (data ?? []).length > AUDIT_PAGE_SIZE;

  // Names for the patients each row will show. When the log is filtered
  // to one patient, that patient is shown first.
  const shown = (row: AuditRow) => {
    const ids = row.patient_ids ?? [];
    const first =
      filters.patientId && ids.includes(filters.patientId)
        ? [filters.patientId, ...ids.filter((id) => id !== filters.patientId)]
        : ids;
    return first.slice(0, NAMES_PER_ROW);
  };
  const wanted = [...new Set(rows.flatMap(shown))];
  const names = new Map<string, string>();
  if (wanted.length > 0) {
    // A failed lookup leaves the page with counts instead of names.
    const { data: patients } = await supabase
      .from("patients")
      .select("id, first_name, last_name")
      .in("id", wanted);
    for (const p of patients ?? []) {
      names.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
    }
  }

  return {
    more,
    entries: rows
      .filter((row) => isStaffAction(row.action))
      .map((row) => ({
        id: row.id,
        at: row.at,
        staffEmail: row.staff_email,
        action: row.action as StaffAction,
        detail: row.detail,
        patientCount: (row.patient_ids ?? []).length,
        patientNames: shown(row)
          .map((id) => names.get(id))
          .filter((n): n is string => Boolean(n)),
      })),
  };
}
