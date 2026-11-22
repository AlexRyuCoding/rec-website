import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitAssign,
  commitFlow,
  commitRestore,
  commitRoomFlow,
} from "./flow-server";
import { assignUpdate, FlowVisit } from "./patient-flow";
import type { RoomRow } from "./room-status";
import { broadcastFlowUpdated } from "./rooms-realtime";
import { fakeSupabase } from "./testing/fake-supabase";
import { applyFlowChange } from "./visits-server";
import type { VisitDbRow } from "./visits-server";

vi.mock("./rooms-realtime", () => ({
  broadcastFlowUpdated: vi.fn(async () => {}),
  broadcastRoomsUpdated: vi.fn(async () => {}),
}));

beforeEach(() => vi.mocked(broadcastFlowUpdated).mockClear());

const NOW = Date.parse("2026-11-23T20:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

const room = (overrides: Partial<RoomRow> = {}): RoomRow => ({
  id: "r1",
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
  updated_at: iso(NOW - 60 * MIN),
  ...overrides,
});

const visit = (id: string, overrides: Partial<FlowVisit> = {}): VisitDbRow => ({
  id,
  checked_in_at: iso(NOW - 20 * MIN),
  appointment_at: null,
  practitioner_name: null,
  room_id: null,
  room_assigned_at: null,
  called_at: null,
  seen_at: null,
  done_at: null,
  patients: { first_name: id.toUpperCase(), last_name: "Test" },
  ...overrides,
});

const inRoom = (id: string, roomId = "r1") =>
  visit(id, {
    room_id: roomId,
    room_assigned_at: iso(NOW - 5 * MIN),
    called_at: iso(NOW - 5 * MIN),
  });

const snapshot = (db: ReturnType<typeof fakeSupabase>) =>
  db.tables.checkins.map((r) => ({ ...r })) as unknown as VisitDbRow[];

// The request as the route makes it: read the visits, apply the rules,
// hand the update to commitAssign.
function assignRequest(
  db: ReturnType<typeof fakeSupabase>,
  theRoom: RoomRow,
  visitId: string,
  togetherWith: string[] = []
) {
  const visitsBefore = snapshot(db);
  const result = assignUpdate(
    theRoom,
    visitsBefore,
    visitId,
    NOW,
    togetherWith
  );
  if (!result.ok) throw new Error(result.error);
  return commitAssign(db.client, {
    room: theRoom,
    update: result.updates[0],
    togetherWith,
    visitsBefore,
    nowMs: NOW,
  });
}

const stored = (db: ReturnType<typeof fakeSupabase>, id: string) =>
  (db.tables.checkins as VisitDbRow[]).find((r) => r.id === id)!;

describe("commitAssign", () => {
  it("sends a waiting patient into an empty room", async () => {
    const db = fakeSupabase({
      checkins: [visit("a")],
      rooms: [room()],
      doctors: [],
    });
    const result = await assignRequest(db, room(), "a");
    expect(result.ok).toBe(true);
    expect(stored(db, "a")).toMatchObject({
      room_id: "r1",
      called_at: iso(NOW),
    });
    expect(broadcastFlowUpdated).toHaveBeenCalledTimes(1);
  });

  it("takes the assign back when another board's patient reached the room at the same instant", async () => {
    const db = fakeSupabase(
      { checkins: [visit("a"), visit("b")], rooms: [room()], doctors: [] },
      {
        // The other board's write lands right after ours, before we look.
        onQuery: (query, index) => {
          if (index === 0 && query.kind === "update") return;
          if (index === 1) Object.assign(stored(db, "b"), inRoom("b"));
        },
      }
    );
    const result = await assignRequest(db, room(), "a");
    expect(result).toEqual({ ok: false, reason: "collision" });
    expect(stored(db, "a")).toMatchObject({
      room_id: null,
      room_assigned_at: null,
      called_at: null,
    });
    // the other patient is not touched
    expect(stored(db, "b").room_id).toBe("r1");
  });

  it("two boards, same empty room, same instant: never both left in the room", async () => {
    const db = fakeSupabase({
      checkins: [visit("a"), visit("b")],
      rooms: [room()],
      doctors: [],
    });
    // Both requests read the room as empty before either writes.
    const results = await Promise.all([
      assignRequest(db, room(), "a"),
      assignRequest(db, room(), "b"),
    ]);
    const inTheRoom = ["a", "b"].filter(
      (id) => stored(db, id).room_id === "r1"
    );
    expect(inTheRoom.length).toBeLessThanOrEqual(1);
    expect(results.filter((r) => r.ok).length).toBe(inTheRoom.length);
  });

  it("keeps a patient who joined the people the answer named", async () => {
    const db = fakeSupabase({
      checkins: [inRoom("a"), visit("b")],
      rooms: [room()],
      doctors: [],
    });
    const result = await assignRequest(db, room(), "b", ["a"]);
    expect(result.ok).toBe(true);
    expect(stored(db, "b")).toMatchObject({
      room_id: "r1",
      called_at: iso(NOW),
    });
  });

  it("refuses when the patient got a room on another board first", async () => {
    const db = fakeSupabase(
      { checkins: [visit("a")], rooms: [room()], doctors: [] },
      {
        onQuery: (_query, index) => {
          if (index === 0) Object.assign(stored(db, "a"), inRoom("a", "r2"));
        },
      }
    );
    const result = await assignRequest(db, room(), "a");
    expect(result).toEqual({ ok: false, reason: "taken" });
    expect(stored(db, "a").room_id).toBe("r2");
    expect(broadcastFlowUpdated).not.toHaveBeenCalled();
  });

  it("takes the assign back when it cannot check who is in the room", async () => {
    const db = fakeSupabase(
      { checkins: [visit("a")], rooms: [room()], doctors: [] },
      { onQuery: (_query, index) => (index === 1 ? "XX000" : undefined) }
    );
    const result = await assignRequest(db, room(), "a");
    expect(result).toEqual({ ok: false, reason: "error" });
    expect(stored(db, "a").room_id).toBeNull();
  });

  it("calls a patient lined up for a room that emptied in the meantime", async () => {
    // The request saw the room setting up; "Room ready" landed on
    // another board before this patient's line-up was written.
    const settingUp = room({ turnover_started_at: iso(NOW - MIN) });
    const db = fakeSupabase({
      checkins: [visit("a")],
      rooms: [room()], // as it is now: ready and empty
      doctors: [],
    });
    const result = await assignRequest(db, settingUp, "a");
    expect(result.ok).toBe(true);
    expect(stored(db, "a")).toMatchObject({
      room_id: "r1",
      called_at: iso(NOW),
    });
  });

  it("leaves a patient lined up while the room is still busy", async () => {
    const settingUp = room({ turnover_started_at: iso(NOW - MIN) });
    const db = fakeSupabase({
      checkins: [inRoom("x"), visit("a")],
      rooms: [settingUp],
      doctors: [],
    });
    const result = await assignRequest(db, settingUp, "a");
    expect(result.ok).toBe(true);
    expect(stored(db, "a")).toMatchObject({ room_id: "r1", called_at: null });
  });
});

describe("commitFlow", () => {
  it("writes the updates and tells the boards", async () => {
    const db = fakeSupabase({
      checkins: [inRoom("a")],
      rooms: [room()],
      doctors: [],
    });
    const visitsBefore = snapshot(db);
    const result = await commitFlow(db.client, {
      updates: [{ id: "a", fields: { seen_at: iso(NOW) } }],
      visitsBefore,
      nowMs: NOW,
    });
    expect(stored(db, "a").seen_at).toBe(iso(NOW));
    expect(result.visits[0]).toMatchObject({ id: "a", display_name: "A T." });
    expect(broadcastFlowUpdated).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when a write is refused, after telling the boards to refetch", async () => {
    const db = fakeSupabase(
      { checkins: [inRoom("a")], rooms: [room()], doctors: [] },
      { onQuery: (query) => (query.kind === "rpc" ? "XX000" : undefined) }
    );
    await expect(
      commitFlow(db.client, {
        updates: [{ id: "a", fields: { seen_at: iso(NOW) } }],
        visitsBefore: [],
        nowMs: NOW,
      })
    ).rejects.toThrow("visit write failed");
    expect(stored(db, "a").seen_at).toBeNull();
    expect(broadcastFlowUpdated).toHaveBeenCalledTimes(1);
  });
});

describe("commitRestore", () => {
  const finished = (id: string, roomId: string | null = "r1") =>
    visit(id, {
      room_id: roomId,
      room_assigned_at: roomId ? iso(NOW - 40 * MIN) : null,
      called_at: roomId ? iso(NOW - 40 * MIN) : null,
      seen_at: roomId ? iso(NOW - 38 * MIN) : null,
      done_at: iso(NOW - 2 * MIN),
    });
  const open = (db: ReturnType<typeof fakeSupabase>) =>
    snapshot(db).filter((v) => v.done_at === null);
  const restore = (
    db: ReturnType<typeof fakeSupabase>,
    id: string,
    r = room()
  ) =>
    commitRestore(db.client, {
      visit: stored(db, id),
      room: r,
      openVisits: open(db),
      nowMs: NOW,
    });

  it("puts the patient back in their empty room exactly as they were", async () => {
    const db = fakeSupabase({
      checkins: [finished("a")],
      rooms: [room()],
      doctors: [],
    });
    const result = await restore(db, "a");
    expect(result).toMatchObject({ ok: true, restoredTo: "room" });
    expect(stored(db, "a")).toMatchObject({
      done_at: null,
      room_id: "r1",
      called_at: iso(NOW - 40 * MIN),
      seen_at: iso(NOW - 38 * MIN),
    });
    expect(broadcastFlowUpdated).toHaveBeenCalledTimes(1);
  });

  it("to the waiting list when the room has been given to someone else", async () => {
    const db = fakeSupabase({
      checkins: [finished("a"), inRoom("x")],
      rooms: [room()],
      doctors: [],
    });
    const result = await restore(db, "a");
    expect(result).toMatchObject({ ok: true, restoredTo: "waiting" });
    expect(stored(db, "a")).toMatchObject({
      done_at: null,
      room_id: null,
      called_at: null,
      seen_at: null,
    });
    expect(stored(db, "x").room_id).toBe("r1");
  });

  it("to the waiting list when another patient reached the room at the same instant", async () => {
    const db = fakeSupabase(
      { checkins: [finished("a"), visit("x")], rooms: [room()], doctors: [] },
      {
        // The other board's assign lands right after our write.
        onQuery: (_query, index) => {
          if (index === 1) Object.assign(stored(db, "x"), inRoom("x"));
        },
      }
    );
    const result = await restore(db, "a");
    expect(result).toMatchObject({ ok: true, restoredTo: "waiting" });
    expect(stored(db, "a")).toMatchObject({ done_at: null, room_id: null });
  });

  it("to the waiting list when it cannot check who is in the room", async () => {
    const db = fakeSupabase(
      { checkins: [finished("a")], rooms: [room()], doctors: [] },
      { onQuery: (_query, index) => (index === 1 ? "XX000" : undefined) }
    );
    const result = await restore(db, "a");
    expect(result).toMatchObject({ ok: true, restoredTo: "waiting" });
    expect(stored(db, "a").room_id).toBeNull();
  });

  it("a patient who had no room goes to the waiting list", async () => {
    const db = fakeSupabase({
      checkins: [finished("a", null)],
      rooms: [],
      doctors: [],
    });
    const result = await restore(db, "a", undefined);
    expect(result).toMatchObject({ ok: true, restoredTo: "waiting" });
    expect(stored(db, "a").done_at).toBeNull();
  });

  it("says so when another board restored them first", async () => {
    const db = fakeSupabase(
      { checkins: [finished("a")], rooms: [room()], doctors: [] },
      {
        onQuery: (_query, index) => {
          if (index === 0) stored(db, "a").done_at = null;
        },
      }
    );
    expect(await restore(db, "a")).toEqual({ ok: false, reason: "gone" });
  });
});

describe("an action is written whole or not at all", () => {
  const settingUp = () => room({ turnover_started_at: iso(NOW - MIN) });
  // "Room ready": a couple is finished and the patient lined up is called.
  const roomReady = [
    { id: "a", fields: { done_at: iso(NOW) } },
    { id: "b", fields: { done_at: iso(NOW) } },
    { id: "c", fields: { called_at: iso(NOW) } },
  ];
  const board = () => ({
    checkins: [
      inRoom("a"),
      inRoom("b"),
      visit("c", { room_id: "r1", room_assigned_at: iso(NOW - MIN) }),
    ],
    rooms: [settingUp()],
    doctors: [],
  });

  it("Room ready lands on the room and all three patients together", async () => {
    const db = fakeSupabase(board());
    const result = await commitRoomFlow(db.client, {
      room: { id: "r1", fields: { turnover_started_at: null } },
      updates: roomReady,
      visitsBefore: snapshot(db),
      nowMs: NOW,
    });
    expect(result?.room.turnover_started_at).toBeNull();
    expect(stored(db, "a").done_at).toBe(iso(NOW));
    expect(stored(db, "b").done_at).toBe(iso(NOW));
    expect(stored(db, "c").called_at).toBe(iso(NOW));
    // one write for all of it
    expect(db.queries.filter((q) => q.kind === "rpc")).toHaveLength(1);
    expect(db.queries.filter((q) => q.kind === "update")).toHaveLength(0);
  });

  it("if one part cannot be written, none is: nobody is finished and the room is still setting up", async () => {
    const db = fakeSupabase(board());
    const result = await commitRoomFlow(db.client, {
      room: { id: "r1", fields: { turnover_started_at: null } },
      // the third visit is gone
      updates: [
        ...roomReady.slice(0, 2),
        { id: "missing", fields: { called_at: iso(NOW) } },
      ],
      visitsBefore: snapshot(db),
      nowMs: NOW,
    });
    expect(result).toBeNull();
    expect(stored(db, "a").done_at).toBeNull();
    expect(stored(db, "b").done_at).toBeNull();
    expect((db.tables.rooms[0] as RoomRow).turnover_started_at).not.toBeNull();
    expect(broadcastFlowUpdated).not.toHaveBeenCalled();
  });

  it("a couple is never half finished when the database refuses the write", async () => {
    const db = fakeSupabase(board(), {
      onQuery: (query) => (query.kind === "rpc" ? "XX000" : undefined),
    });
    await expect(
      commitFlow(db.client, {
        updates: roomReady,
        visitsBefore: snapshot(db),
        nowMs: NOW,
      })
    ).rejects.toThrow("visit write failed");
    expect(["a", "b"].map((id) => stored(db, id).done_at)).toEqual([
      null,
      null,
    ]);
    // …and it did not then try the rows one by one
    expect(db.queries.filter((q) => q.kind === "update")).toHaveLength(0);
  });

  it("nothing to write asks the database nothing", async () => {
    const db = fakeSupabase(board());
    expect(await applyFlowChange(db.client, { updates: [] })).toEqual({
      ok: true,
      room: null,
    });
    expect(db.queries).toHaveLength(0);
  });

  it("until migration 0021 is applied the rows are written one by one, as before", async () => {
    const db = fakeSupabase(board(), {
      onQuery: (query) => (query.kind === "rpc" ? "PGRST202" : undefined),
    });
    const result = await commitRoomFlow(db.client, {
      room: { id: "r1", fields: { turnover_started_at: null } },
      updates: roomReady,
      visitsBefore: snapshot(db),
      nowMs: NOW,
    });
    expect(result?.room.turnover_started_at).toBeNull();
    expect(stored(db, "a").done_at).toBe(iso(NOW));
    expect(stored(db, "c").called_at).toBe(iso(NOW));
    expect(db.queries.filter((q) => q.kind === "update")).toHaveLength(4);
  });
});
