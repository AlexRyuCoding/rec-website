// The timer route end to end, against the in-memory database: which
// actions wait on patients, and that a room and its patients change
// together.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RoomRow } from "./room-status";
import { fakeSupabase } from "./testing/fake-supabase";

const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => (db.current as { client: unknown }).client,
}));
vi.mock("@/lib/admin-auth", () => ({
  getAdminEmail: async () => "desk@example.com",
  isAdminAuthorized: async () => true,
}));
vi.mock("@/lib/rooms-realtime", async (original) => ({
  ...(await original<typeof import("./rooms-realtime")>()),
  broadcastFlowUpdated: vi.fn(async () => {}),
  broadcastRoomsUpdated: vi.fn(async () => {}),
}));

import { POST } from "@/app/api/admin/rooms/[id]/timer/route";

const ROOM = "11111111-1111-4111-8111-111111111111";
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const room = (overrides: Partial<RoomRow> = {}): RoomRow => ({
  id: ROOM,
  name: "Room 1",
  grid_row: 0,
  grid_col: 0,
  doctor_name: null,
  default_duration_seconds: 900,
  timer_started_at: null,
  timer_duration_seconds: null,
  timer_paused_at: null,
  capacity: 2,
  turnover_started_at: null,
  updated_at: ago(60 * MIN),
  ...overrides,
});

const visit = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  patient_id: `p-${id}`,
  checked_in_at: ago(30 * MIN),
  appointment_at: null,
  service_name: null,
  practitioner_name: null,
  room_id: ROOM,
  room_assigned_at: ago(20 * MIN),
  called_at: ago(20 * MIN),
  seen_at: ago(18 * MIN),
  done_at: null,
  patients: {
    first_name: id.toUpperCase(),
    last_name: "Test",
    created_at: ago(900 * 24 * 60 * MIN),
  },
  ...o,
});

type Fake = ReturnType<typeof fakeSupabase>;
function board(
  theRoom: RoomRow,
  checkins: object[],
  options: Parameters<typeof fakeSupabase>[1] = {}
): Fake {
  const fake = fakeSupabase(
    { rooms: [theRoom], checkins, doctors: [] },
    options
  );
  db.current = fake;
  return fake;
}

const act = (action: string) =>
  POST(
    new NextRequest(`https://example.test/api/admin/rooms/${ROOM}/timer`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
    { params: Promise.resolve({ id: ROOM }) }
  );

const stored = (fake: Fake, id: string) =>
  (fake.tables.checkins as ReturnType<typeof visit>[]).find(
    (v) => v.id === id
  )!;
const storedRoom = (fake: Fake) => fake.tables.rooms[0] as RoomRow;
const touched = (fake: Fake, table: string) =>
  fake.queries.filter((q) => q.table === table).map((q) => q.kind);

beforeEach(() => {
  db.current = null;
});

describe("timer route: ✓ silences the alarm whatever else is going on", () => {
  const timeUp = () =>
    room({ timer_started_at: ago(16 * MIN), timer_duration_seconds: 900 });

  it("✓ changes only the timer, and reads nothing about patients", async () => {
    const fake = board(timeUp(), [visit("a")]);
    const res = await act("clear");
    expect(res.status).toBe(200);
    expect(storedRoom(fake).timer_started_at).toBeNull();
    expect(storedRoom(fake).turnover_started_at).not.toBeNull();
    expect(touched(fake, "checkins")).toEqual([]);
    expect(fake.queries.some((q) => q.kind === "rpc")).toBe(false);
  });

  it("✓ works even when the patients cannot be read at all", async () => {
    const fake = board(timeUp(), [visit("a")], {
      onQuery: (query) => (query.table === "checkins" ? "XX000" : undefined),
    });
    expect((await act("clear")).status).toBe(200);
    expect(storedRoom(fake).timer_started_at).toBeNull();
  });

  it("pause is the same: the timer only", async () => {
    const fake = board(
      room({ timer_started_at: ago(5 * MIN), timer_duration_seconds: 900 }),
      [visit("a")]
    );
    expect((await act("pause")).status).toBe(200);
    expect(storedRoom(fake).timer_paused_at).not.toBeNull();
    expect(touched(fake, "checkins")).toEqual([]);
  });
});

describe("timer route: Room ready", () => {
  const settingUp = () => room({ turnover_started_at: ago(2 * MIN) });
  const couple = () => [
    visit("a"),
    visit("b"),
    visit("c", {
      called_at: null,
      seen_at: null,
      room_assigned_at: ago(3 * MIN),
    }),
  ];

  it("finishes the room's patients, calls the one lined up and frees the room — in one write", async () => {
    const fake = board(settingUp(), couple());
    const res = await act("ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(storedRoom(fake).turnover_started_at).toBeNull();
    expect(stored(fake, "a").done_at).not.toBeNull();
    expect(stored(fake, "b").done_at).not.toBeNull();
    expect(stored(fake, "c").called_at).not.toBeNull();
    expect(fake.queries.filter((q) => q.kind === "rpc")).toHaveLength(1);
    // the room and the patients did not go as separate writes
    expect(touched(fake, "rooms")).not.toContain("update");
    expect(touched(fake, "checkins")).not.toContain("update");
    expect(body.room.turnover_started_at).toBeNull();
    expect(body.visits.map((v: { id: string }) => v.id)).toEqual(["c"]);
  });

  it("if it cannot be written, nothing changed: the room is still setting up with both patients in it", async () => {
    const fake = board(settingUp(), couple(), {
      onQuery: (query) => (query.kind === "rpc" ? "XX000" : undefined),
    });
    const res = await act("ready");
    expect(res.status).toBe(500);
    expect(storedRoom(fake).turnover_started_at).not.toBeNull();
    expect(stored(fake, "a").done_at).toBeNull();
    expect(stored(fake, "b").done_at).toBeNull();
    expect(stored(fake, "c").called_at).toBeNull();
  });

  it("if who is in the room cannot be read, the room is not marked ready on its own", async () => {
    const fake = board(settingUp(), couple(), {
      onQuery: (query) =>
        query.table === "checkins" && query.kind === "select"
          ? "XX000"
          : undefined,
    });
    const res = await act("ready");
    expect(res.status).toBe(500);
    expect(storedRoom(fake).turnover_started_at).not.toBeNull();
  });
});

describe("timer route: Start", () => {
  it("starts the timer and marks the waiting patient seen, together", async () => {
    const fake = board(room(), [visit("a", { seen_at: null })]);
    expect((await act("start")).status).toBe(200);
    expect(storedRoom(fake).timer_started_at).not.toBeNull();
    expect(stored(fake, "a").seen_at).not.toBeNull();
    expect(fake.queries.filter((q) => q.kind === "rpc")).toHaveLength(1);
  });

  it("with nobody tracked in the room it is just the timer", async () => {
    const fake = board(room(), []);
    expect((await act("start")).status).toBe(200);
    expect(storedRoom(fake).timer_started_at).not.toBeNull();
    expect(fake.queries.some((q) => q.kind === "rpc")).toBe(false);
  });

  it("refuses an action the timer's state does not allow", async () => {
    board(
      room({ timer_started_at: ago(MIN), timer_duration_seconds: 900 }),
      []
    );
    expect((await act("start")).status).toBe(409);
  });
});
