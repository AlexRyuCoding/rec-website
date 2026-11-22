// The staff audit log, as far as it can be described without a database:
// which actions exist, what each is called on the Log page, and how a
// check-in history view is worded. Pure. Writing and reading the table is
// audit-server.ts.

import { CLINIC_TZ } from "./clinic-time";

export const STAFF_ACTIONS = [
  "patient_search",
  "pin_reset",
  "staff_checkin",
  "checkins_view",
  "checkins_export",
  "visit_remove",
  "visit_restore",
  "device_pair",
  "device_revoke",
] as const;

export type StaffAction = (typeof STAFF_ACTIONS)[number];

// What the Log page calls each action, in the past tense of a logbook.
export const ACTION_LABELS: Record<StaffAction, string> = {
  patient_search: "Searched patients",
  pin_reset: "Reset a PIN",
  staff_checkin: "Checked a patient in",
  checkins_view: "Viewed check-ins",
  checkins_export: "Exported check-ins",
  visit_remove: "Removed from the rooms board",
  visit_restore: "Restored to the rooms board",
  device_pair: "Paired a device",
  device_revoke: "Revoked a device",
};

export function isStaffAction(value: unknown): value is StaffAction {
  return (
    typeof value === "string" &&
    (STAFF_ACTIONS as readonly string[]).includes(value)
  );
}

// A check-in history view or export is recorded with the dates it
// covered. A view is written at most once per this long for the same
// person and the same dates: the check-ins view refreshes itself every
// minute while it is open, and a row a minute would bury everything else.
// New arrivals are still picked up — the next row, at most this much
// later, lists them.
export const VIEW_REPEAT_MS = 15 * 60 * 1000;

const clinicDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });

// "2026-11-23" or "2026-11-01 to 2026-11-23" — the clinic's calendar
// days covered by a from/to range (`to` is the first moment after it).
// Later pages of a long range say where they start.
export function checkinRangeDetail(
  fromIso: string,
  toIso: string,
  offset = 0
): string {
  const first = clinicDate(Date.parse(fromIso));
  const last = clinicDate(Date.parse(toIso) - 1);
  const dates = first === last ? first : `${first} to ${last}`;
  return offset > 0 ? `${dates}, from row ${offset + 1}` : dates;
}

// One line of the Log page.
export interface AuditEntryView {
  id: number;
  at: string;
  staffEmail: string;
  action: StaffAction;
  detail: string | null;
  // How many patients the row names, and the first few by name. A name is
  // missing when the patient's record has since been deleted (the log
  // outlives it).
  patientCount: number;
  patientNames: string[];
}

// "Ann Licater", "Ann Licater and Bob Stone", "Ann Licater, Bob Stone and
// 38 more" — or how many, when no names could be found.
export function patientsSummary(names: string[], count: number): string {
  if (count === 0) return "";
  const rest = count - names.length;
  if (names.length === 0) {
    return `${count} patient${count === 1 ? "" : "s"}`;
  }
  if (rest <= 0) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.join(", ")} and ${rest} more`;
}
