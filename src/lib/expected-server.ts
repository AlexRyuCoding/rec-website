// The day's Practice Better schedule, fetched once and shared by every
// board (day_schedule_cache, migration 0020), and the "Expected" list
// made from it. Rules: expected.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DaySession,
  ExpectedRow,
  expectedRows,
  parsePbSessions,
  scheduleIsStale,
} from "./expected";
import { clinicDayBounds, fetchDaySessionItems } from "./practice-better";

const SCHEDULE_TABLE = "day_schedule_cache";

export interface DaySchedule {
  sessions: DaySession[];
  // When Practice Better was last asked.
  fetchedAt: string;
  // Practice Better could not be reached just now: this is the copy from
  // `fetchedAt`, older than it should be.
  stale: boolean;
  // false = the day had more sessions than could be read.
  complete: boolean;
}

// Why the schedule could not be had at all.
export class ScheduleUnavailable extends Error {
  constructor(
    // "no-table": the cache table is not there (migration 0020).
    // "practice-better": it could not be reached and nothing is held.
    public reason: "no-table" | "practice-better"
  ) {
    super(`schedule unavailable: ${reason}`);
  }
}

type FetchDay = typeof fetchDaySessionItems;

// Today's schedule: the copy we hold if it is fresh enough, otherwise a
// new one from Practice Better (kept for the next asker).
//
// - Without the cache table nothing is fetched at all. Asking Practice
//   Better on every request instead would be exactly the flood of
//   requests the table exists to prevent.
// - If Practice Better fails and an older copy of today is held, that
//   copy is returned, marked stale: an appointment list from ten minutes
//   ago is more use to the front desk than an error.
export async function loadDaySchedule(
  supabase: SupabaseClient,
  nowMs: number,
  forced: boolean,
  fetchDay: FetchDay = fetchDaySessionItems
): Promise<DaySchedule> {
  const now = new Date(nowMs);
  const { day } = clinicDayBounds(now);

  const { data: held, error } = await supabase
    .from(SCHEDULE_TABLE)
    .select("day, fetched_at, complete, sessions")
    .eq("day", day)
    .maybeSingle();
  if (error) throw new ScheduleUnavailable("no-table");

  const heldSchedule = (stale: boolean): DaySchedule => ({
    sessions: Array.isArray(held?.sessions)
      ? (held.sessions as DaySession[])
      : [],
    fetchedAt: held!.fetched_at,
    stale,
    complete: held!.complete !== false,
  });
  const fetchedAtMs = held ? Date.parse(held.fetched_at) : null;
  if (held && !scheduleIsStale(fetchedAtMs, nowMs, forced)) {
    return heldSchedule(false);
  }

  let fresh: { items: unknown[]; complete: boolean };
  try {
    fresh = await fetchDay(now);
  } catch {
    console.error("PB day schedule fetch failed");
    if (held) return heldSchedule(true);
    throw new ScheduleUnavailable("practice-better");
  }

  const schedule: DaySchedule = {
    sessions: parsePbSessions(fresh.items, day),
    fetchedAt: now.toISOString(),
    stale: false,
    complete: fresh.complete,
  };
  // Best effort: if the copy cannot be kept, this asker still gets the
  // list; the next one fetches again.
  try {
    await supabase.from(SCHEDULE_TABLE).upsert(
      {
        day,
        fetched_at: schedule.fetchedAt,
        complete: schedule.complete,
        sessions: schedule.sessions,
      },
      { onConflict: "day" }
    );
    await supabase.from(SCHEDULE_TABLE).delete().lt("day", day);
  } catch {
    // ignore
  }
  return schedule;
}

export interface ExpectedList {
  expected: ExpectedRow[];
  // Appointments whose patient is not in our table yet.
  unmatched: number;
  fetchedAt: string;
  stale: boolean;
  complete: boolean;
}

// Who is still expected today. The schedule may be a few minutes old;
// who has checked in is read fresh every time, so a patient disappears
// from the list the moment they check in.
export async function loadExpected(
  supabase: SupabaseClient,
  nowMs: number,
  forced: boolean,
  fetchDay: FetchDay = fetchDaySessionItems
): Promise<ExpectedList> {
  const schedule = await loadDaySchedule(supabase, nowMs, forced, fetchDay);
  const pbIds = [...new Set(schedule.sessions.map((s) => s.pbClientId))];

  let patients: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    pb_client_id: string | null;
  }[] = [];
  const checkedIn: string[] = [];
  if (pbIds.length > 0) {
    const { data, error } = await supabase
      .from("patients")
      .select("id, first_name, last_name, pb_client_id")
      .in("pb_client_id", pbIds);
    if (error) throw new Error("patients fetch failed");
    patients = data ?? [];
  }
  if (patients.length > 0) {
    const { startIso } = clinicDayBounds(new Date(nowMs));
    const { data, error } = await supabase
      .from("checkins")
      .select("patient_id")
      .gte("checked_in_at", startIso)
      .in(
        "patient_id",
        patients.map((p) => p.id)
      );
    if (error) throw new Error("checkins fetch failed");
    checkedIn.push(...(data ?? []).map((c) => c.patient_id as string));
  }

  const { rows, unmatched } = expectedRows(
    schedule.sessions,
    patients,
    checkedIn
  );
  return {
    expected: rows,
    unmatched,
    fetchedAt: schedule.fetchedAt,
    stale: schedule.stale,
    complete: schedule.complete,
  };
}
