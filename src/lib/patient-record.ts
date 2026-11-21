// A Practice Better client record → the row stored in the patients table.
// The one place this is decided for the webhook and the dashboard sync;
// scripts/sync-patients.js keeps its own copy of the same rules (plain
// JS, run from the terminal) and patient-record.test.ts runs both.

import type { PbClientRecord } from "./practice-better";

export interface PatientRecordRow {
  pb_client_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

// Text as a person meant it: no spaces around it, one space where there
// were several (or a tab, line break, non-breaking space), and none of
// the invisible characters that come along when a name is pasted in.
// "Ann " and "Ann" must be the same patient to the search and the kiosk.
export function cleanText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPatientRow(record: PbClientRecord): PatientRecordRow {
  const profile = record.profile ?? {};
  return {
    pb_client_id: record.id,
    first_name: cleanText(profile.firstName),
    last_name: cleanText(profile.lastName),
    // stored lowercase; blank = none
    email: cleanText(profile.emailAddress).toLowerCase() || null,
    // a blank mobile must not hide the home phone
    phone:
      cleanText(profile.mobilePhone) || cleanText(profile.homePhone) || null,
  };
}
