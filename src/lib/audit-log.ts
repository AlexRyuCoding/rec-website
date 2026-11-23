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
  // Sign-ins (migration 0022). These three name no patient.
  "staff_signin",
  "staff_signout",
  "signin_refused",
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
  staff_signin: "Signed in",
  staff_signout: "Signed out",
  signin_refused: "Sign-in refused",
};

export function isStaffAction(value: unknown): value is StaffAction {
  return (
    typeof value === "string" &&
    (STAFF_ACTIONS as readonly string[]).includes(value)
  );
}

// ---- sign-ins -------------------------------------------------------------
//
// A row when a staff member signs in, a row when they press Sign out, and
// a row when a Google account that is not on the staff list tries to sign
// in and is refused. The first two can only be caused by staff. The third
// can be caused by anyone on the internet who has a Google account, so
// what it writes and how often is decided here.

// What a refused row says in the Detail column.
export const REFUSED_DETAIL = "Not on the staff list";

// The longest an email address can be. A refused address was chosen by a
// stranger: it is cut to this before it is stored.
export const SIGNIN_ADDRESS_MAX = 254;
// What is stored when the account gave no address at all.
export const NO_ADDRESS = "(no address)";

// The address of the account that signed in or tried to, as it is stored
// and shown: lowercase (as the allowlist compares it), with blanks, line
// breaks, invisible and direction-changing characters and halves of
// characters taken out, and cut to SIGNIN_ADDRESS_MAX whole characters.
// It is only ever data: compared, stored and shown as text.
export function signInAddress(value: unknown): string {
  if (typeof value !== "string") return NO_ADDRESS;
  const cleaned = [...value.replace(/[\p{C}\p{Z}]/gu, "").toLowerCase()]
    .slice(0, SIGNIN_ADDRESS_MAX)
    .join("");
  return cleaned || NO_ADDRESS;
}

// The same address is written at most once per this long: someone who
// tries three times in a minute is one row, as one lookup is.
export const REFUSED_REPEAT_MS = 15 * 60 * 1000;
// And however many addresses try, at most this many refused rows are
// written per hour. The clinic's own refusals — a staff member on their
// personal account, someone taken off the list — are a few a week; the
// limit is what a stranger with many accounts runs into. Past it the
// attempt is still refused, it is only not written down.
export const REFUSED_WINDOW_MS = 60 * 60 * 1000;
export const REFUSED_PER_HOUR = 20;

// Whether a refused sign-in gets a row, given the refused rows of the
// last hour: "write"; "repeat" (this address already has one in the last
// fifteen minutes); "full" (the hour's limit is reached). A row whose
// time cannot be read counts as recent — in doubt, fewer rows.
export function refusedRowVerdict(
  recent: { staff_email: string; at: string }[],
  address: string,
  nowMs: number
): "write" | "repeat" | "full" {
  const within = (at: string, ms: number) => !(Date.parse(at) < nowMs - ms);
  const lastHour = recent.filter((row) => within(row.at, REFUSED_WINDOW_MS));
  if (
    lastHour.some(
      (row) => row.staff_email === address && within(row.at, REFUSED_REPEAT_MS)
    )
  ) {
    return "repeat";
  }
  return lastHour.length >= REFUSED_PER_HOUR ? "full" : "write";
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
