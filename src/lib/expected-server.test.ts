import { describe, expect, it } from "vitest";
import {
  loadDaySchedule,
  loadExpected,
  ScheduleUnavailable,
} from "./expected-server";
import { fakeSupabase } from "./testing/fake-supabase";

// 23 November 2026, 10:00 in the clinic (UTC-8).
const DAY = "2026-11-23";
const local = (time: string) => `${DAY}T${time}:00-08:00`;
const NOW = Date.parse(local("10:00"));
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

const pbItem = (id: string, pbClientId: string, time: string) => ({
  id,
  sessionDate: local(time),
  cancelled: false,
  clientRecord: { id: pbClientId },
  consultant: { profile: { firstName: "Alex", lastName: "Ryu" } },
  service: { name: "Acupuncture" },
});

// Practice Better, counting how often it is asked.
function practiceBetter(items: unknown[] = [pbItem("s1", "pb-1", "10:30")]) {
  const calls = { count: 0, fail: false };
  const fetchDay = async () => {
    calls.count++;
    if (calls.fail) throw new Error("PB down");
    return { items, complete: true };
  };
  return { calls, fetchDay };
}

const heldRow = (fetchedAtMs: number, sessions: unknown[] = []) => ({
  day: DAY,
  fetched_at: iso(fetchedAtMs),
  complete: true,
  sessions,
});
const session = (pbClientId: string, time: string) => ({
  pbClientId,
  at: iso(Date.parse(local(time))),
  practitioner: "Alex Ryu",
  service: "Acupuncture",
});

describe("loadDaySchedule", () => {
  it("asks Practice Better when nothing is held, and keeps the answer", async () => {
    const db = fakeSupabase({ day_schedule_cache: [] });
    const pb = practiceBetter();
    const schedule = await loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    expect(pb.calls.count).toBe(1);
    expect(schedule).toMatchObject({
      stale: false,
      complete: true,
      fetchedAt: iso(NOW),
    });
    expect(schedule.sessions).toEqual([session("pb-1", "10:30")]);
    expect(db.tables.day_schedule_cache).toEqual([
      {
        day: DAY,
        fetched_at: iso(NOW),
        complete: true,
        sessions: [session("pb-1", "10:30")],
      },
    ]);
  });

  it("many boards within five minutes are one request to Practice Better", async () => {
    const db = fakeSupabase({ day_schedule_cache: [] });
    const pb = practiceBetter();
    for (let board = 0; board < 6; board++) {
      await loadDaySchedule(
        db.client,
        NOW + board * 40_000,
        false,
        pb.fetchDay
      );
    }
    expect(pb.calls.count).toBe(1);
  });

  it("asks again once the copy is five minutes old", async () => {
    const db = fakeSupabase({ day_schedule_cache: [heldRow(NOW - 6 * MIN)] });
    const pb = practiceBetter();
    await loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    expect(pb.calls.count).toBe(1);
    expect(db.tables.day_schedule_cache).toHaveLength(1);
  });

  it("Refresh asks sooner — but not within thirty seconds", async () => {
    const db = fakeSupabase({ day_schedule_cache: [heldRow(NOW - 10_000)] });
    const pb = practiceBetter();
    await loadDaySchedule(db.client, NOW, true, pb.fetchDay);
    expect(pb.calls.count).toBe(0);
    await loadDaySchedule(db.client, NOW + 25_000, true, pb.fetchDay);
    expect(pb.calls.count).toBe(1);
  });

  it("falls back to the copy it holds when Practice Better is down, and says it is stale", async () => {
    const db = fakeSupabase({
      day_schedule_cache: [heldRow(NOW - 20 * MIN, [session("pb-1", "10:30")])],
    });
    const pb = practiceBetter();
    pb.calls.fail = true;
    const schedule = await loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    expect(schedule).toMatchObject({
      stale: true,
      fetchedAt: iso(NOW - 20 * MIN),
    });
    expect(schedule.sessions).toHaveLength(1);
  });

  it("says Practice Better is unreachable when it holds nothing", async () => {
    const db = fakeSupabase({ day_schedule_cache: [] });
    const pb = practiceBetter();
    pb.calls.fail = true;
    await expect(
      loadDaySchedule(db.client, NOW, false, pb.fetchDay)
    ).rejects.toMatchObject({
      reason: "practice-better",
    });
  });

  it("does not use yesterday's copy as today's, and clears it out", async () => {
    const db = fakeSupabase({
      day_schedule_cache: [
        {
          day: "2026-11-22",
          fetched_at: iso(NOW - 60_000),
          complete: true,
          sessions: [session("old", "10:30")],
        },
      ],
    });
    const pb = practiceBetter();
    const schedule = await loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    expect(pb.calls.count).toBe(1);
    expect(schedule.sessions).toEqual([session("pb-1", "10:30")]);
    expect(
      (db.tables.day_schedule_cache as { day: string }[]).map((r) => r.day)
    ).toEqual([DAY]);
  });

  it("without the cache table it asks Practice Better nothing at all", async () => {
    const db = fakeSupabase({}, { onQuery: () => "42P01" });
    const pb = practiceBetter();
    const attempt = loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    await expect(attempt).rejects.toBeInstanceOf(ScheduleUnavailable);
    await expect(attempt).rejects.toMatchObject({ reason: "no-table" });
    expect(pb.calls.count).toBe(0);
  });

  it("still answers when the copy cannot be kept", async () => {
    const db = fakeSupabase(
      { day_schedule_cache: [] },
      { onQuery: (query) => (query.kind === "upsert" ? "XX000" : undefined) }
    );
    const pb = practiceBetter();
    const schedule = await loadDaySchedule(db.client, NOW, false, pb.fetchDay);
    expect(schedule.sessions).toHaveLength(1);
  });
});

describe("loadExpected", () => {
  const patients = [
    { id: "p1", first_name: "Ann", last_name: "Licater", pb_client_id: "pb-1" },
    { id: "p2", first_name: "Bob", last_name: "Stone", pb_client_id: "pb-2" },
    { id: "p9", first_name: "Zed", last_name: "Other", pb_client_id: "pb-9" },
  ];
  const day = [
    pbItem("s1", "pb-1", "09:30"),
    pbItem("s2", "pb-2", "11:00"),
    pbItem("s3", "pb-new", "13:00"),
  ];

  it("lists today's appointments whose patients have not checked in", async () => {
    const db = fakeSupabase({ day_schedule_cache: [], patients, checkins: [] });
    const list = await loadExpected(
      db.client,
      NOW,
      false,
      practiceBetter(day).fetchDay
    );
    expect(list.expected.map((r) => [r.displayName, r.patientId])).toEqual([
      ["Ann L.", "p1"],
      ["Bob S.", "p2"],
    ]);
    expect(list.unmatched).toBe(1);
    expect(list).toMatchObject({ stale: false, complete: true });
    expect(JSON.stringify(list)).not.toContain("Licater");
  });

  it("a patient disappears the moment they check in, though the schedule is a held copy", async () => {
    const db = fakeSupabase({ day_schedule_cache: [], patients, checkins: [] });
    const pb = practiceBetter(day);
    await loadExpected(db.client, NOW, false, pb.fetchDay);
    (db.tables.checkins as object[]).push({
      patient_id: "p1",
      checked_in_at: iso(NOW + 30_000),
    });
    const list = await loadExpected(
      db.client,
      NOW + 60_000,
      false,
      pb.fetchDay
    );
    expect(list.expected.map((r) => r.patientId)).toEqual(["p2"]);
    expect(pb.calls.count).toBe(1);
  });

  it("yesterday's check-in does not count as arrived today", async () => {
    const db = fakeSupabase({
      day_schedule_cache: [],
      patients,
      checkins: [
        { patient_id: "p1", checked_in_at: "2026-11-22T20:00:00.000Z" },
      ],
    });
    const list = await loadExpected(
      db.client,
      NOW,
      false,
      practiceBetter(day).fetchDay
    );
    expect(list.expected.map((r) => r.patientId)).toEqual(["p1", "p2"]);
  });

  it("an evening check-in yesterday (already 'today' in UTC) does not count either", async () => {
    // 22 Nov 7:30 pm in the clinic is 23 Nov 03:30 UTC
    const db = fakeSupabase({
      day_schedule_cache: [],
      patients,
      checkins: [
        { patient_id: "p1", checked_in_at: "2026-11-23T03:30:00.000Z" },
      ],
    });
    const list = await loadExpected(
      db.client,
      NOW,
      false,
      practiceBetter(day).fetchDay
    );
    expect(list.expected.map((r) => r.patientId)).toContain("p1");
  });

  it("an empty day asks our tables nothing more", async () => {
    const db = fakeSupabase({ day_schedule_cache: [], patients, checkins: [] });
    const list = await loadExpected(
      db.client,
      NOW,
      false,
      practiceBetter([]).fetchDay
    );
    expect(list).toMatchObject({ expected: [], unmatched: 0 });
    expect(
      db.queries.filter((q) => q.table === "patients" || q.table === "checkins")
    ).toEqual([]);
  });
});
