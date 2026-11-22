// Reading check-ins for the dashboard: a page of them for the table, and
// the timestamps of the whole range for the wait-time numbers.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckinRecord, VisitTimestamps } from "./visit-stats";

// Rows per page of the table (and per request of a CSV export).
export const CHECKIN_PAGE_SIZE = 500;
// PostgREST answers at most 1,000 rows per query.
const TIMING_PAGE_SIZE = 1000;
// 20,000 check-ins is years of a clinic this size; beyond that the
// numbers say they are partial rather than taking minutes to load.
const TIMING_MAX_PAGES = 20;

const one = <T>(embed: T | T[] | null | undefined): T | null =>
  Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null);

export interface CheckinPage {
  checkins: CheckinRecord[];
  // Check-ins in the whole range.
  total: number;
  // There are more after this page.
  more: boolean;
  // The patients listed on this page — for the audit log, not the browser.
  patientIds: string[];
}

// One page of check-ins in [from, to), newest first. Throws on a database
// error.
export async function loadCheckinPage(
  supabase: SupabaseClient,
  from: string,
  to: string,
  offset: number
): Promise<CheckinPage> {
  const { data, error, count } = await supabase
    .from("checkins")
    .select(
      "id, patient_id, checked_in_at, appointment_at, service_name, practitioner_name, room_id, called_at, seen_at, done_at, patients(first_name, last_name), rooms(name)",
      { count: "exact" }
    )
    .gte("checked_in_at", from)
    .lt("checked_in_at", to)
    .order("checked_in_at", { ascending: false })
    .range(offset, offset + CHECKIN_PAGE_SIZE - 1);
  if (error) throw new Error("checkins fetch failed");

  const checkins = (data ?? []).map((c): CheckinRecord => {
    const patient = one(c.patients);
    const room = one(c.rooms);
    return {
      id: c.id,
      checked_in_at: c.checked_in_at,
      appointment_at: c.appointment_at,
      service_name: c.service_name,
      practitioner_name: c.practitioner_name,
      room_id: c.room_id,
      room_name: room?.name ?? null,
      called_at: c.called_at,
      seen_at: c.seen_at,
      done_at: c.done_at,
      first_name: patient?.first_name ?? "",
      last_name: patient?.last_name ?? "",
    };
  });
  const total = count ?? checkins.length;
  const patientIds = [
    ...new Set(
      (data ?? [])
        .map((c) => c.patient_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  return {
    checkins,
    total,
    more: offset + checkins.length < total,
    patientIds,
  };
}

export type TimingRow = VisitTimestamps & { practitioner_name: string | null };

// The timestamps of every check-in in [from, to) — no names — for the
// wait-time numbers, which must describe the whole range and not just the
// page on screen. `complete` is false if the range was too large to read
// in full. Throws on a database error.
export async function loadCheckinTimings(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<{ rows: TimingRow[]; complete: boolean }> {
  const rows: TimingRow[] = [];
  for (let page = 0; page < TIMING_MAX_PAGES; page++) {
    const start = page * TIMING_PAGE_SIZE;
    const { data, error } = await supabase
      .from("checkins")
      .select(
        "checked_in_at, room_id, called_at, seen_at, done_at, practitioner_name"
      )
      .gte("checked_in_at", from)
      .lt("checked_in_at", to)
      .order("checked_in_at", { ascending: false })
      .range(start, start + TIMING_PAGE_SIZE - 1);
    if (error) throw new Error("checkin timings fetch failed");
    rows.push(...((data ?? []) as TimingRow[]));
    if (!data || data.length < TIMING_PAGE_SIZE)
      return { rows, complete: true };
  }
  return { rows, complete: false };
}
