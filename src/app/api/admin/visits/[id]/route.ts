import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { commitAssign, commitFlow, commitRestore } from "@/lib/flow-server";
import {
  applyVisitUpdates,
  assignUpdate,
  markWaitingUpdate,
  promotionUpdates,
  removeUpdate,
  unassignUpdate,
  VisitUpdate,
} from "@/lib/patient-flow";
import { MAX_ROOM_CAPACITY, RoomRow } from "@/lib/room-status";
import {
  loadActiveVisits,
  loadFinishedVisit,
  VisitDbRow,
} from "@/lib/visits-server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    roomId: z.string().uuid(),
    // The visits staff said this patient is together with (the names the
    // board's question showed). Absent = not together.
    togetherWith: z.array(z.string().uuid()).max(MAX_ROOM_CAPACITY).optional(),
  }),
  z.object({ action: z.literal("unassign") }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("mark_waiting") }),
  z.object({ action: z.literal("restore") }),
]);

// Staff move a checked-in patient through the flow:
// - assign:   send to a room. An empty room: called now. A room with
//             someone in it: called now only together with the people
//             named in togetherWith (and only if they are still the
//             ones there), otherwise lined up and called automatically
//             when the room is ready
// - unassign: back to the waiting list
// - remove:   finished / no-show / handled another way
// - mark_waiting: undo a mistaken "Doctor in" — the patient is waiting
//             for the doctor again and the board's alert comes back
// - restore:  a FINISHED visit is open again (the board's "Finished"
//             list): back into the room they were in if it still stands
//             empty, otherwise to the waiting list — see restoreTarget
// Whatever the action, if it empties the room the patient leaves, the
// people lined up for that room are called.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createServiceClient();
  const nowMs = Date.now();

  let visits: VisitDbRow[];
  try {
    visits = await loadActiveVisits(supabase, nowMs);
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  const loadRoom = async (roomId: string): Promise<RoomRow | null> => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    return (data as RoomRow | null) ?? null;
  };

  // Restore is the one action on a visit that is NOT on the board.
  if (input.action === "restore") {
    if (visits.some((v) => v.id === id)) {
      return NextResponse.json(
        { error: "That patient is already back on the board" },
        { status: 409 }
      );
    }
    let finished: VisitDbRow | null;
    try {
      finished = await loadFinishedVisit(supabase, id, nowMs);
    } catch {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!finished) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }
    const restored = await commitRestore(supabase, {
      visit: finished,
      room: finished.room_id ? await loadRoom(finished.room_id) : null,
      openVisits: visits,
      nowMs,
    });
    if (restored.ok) {
      return NextResponse.json({
        visits: restored.visits,
        rooms: restored.rooms,
        restoredTo: restored.restoredTo,
      });
    }
    return restored.reason === "gone"
      ? NextResponse.json(
          { error: "That patient is already back on the board" },
          { status: 409 }
        )
      : NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const visit = visits.find((v) => v.id === id);
  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const updates: VisitUpdate[] = [];
  if (input.action === "assign") {
    const room = await loadRoom(input.roomId);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const result = assignUpdate(room, visits, id, nowMs, input.togetherWith);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    // An assign goes through its own guarded write: the rules above were
    // right about what this request read, but another board may be
    // assigning at the same instant (see commitAssign).
    const assigned = await commitAssign(supabase, {
      room,
      update: result.updates[0],
      togetherWith: input.togetherWith ?? [],
      visitsBefore: visits,
      nowMs,
    });
    if (assigned.ok) {
      return NextResponse.json({
        visits: assigned.visits,
        rooms: assigned.rooms,
      });
    }
    if (assigned.reason === "error") {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    return NextResponse.json(
      {
        error:
          assigned.reason === "taken"
            ? "That patient already has a room — please choose again"
            : `${room.name} changed — please choose again`,
      },
      { status: 409 }
    );
  } else if (input.action === "unassign") {
    updates.push(unassignUpdate(id));
  } else if (input.action === "mark_waiting") {
    // Only meaningful for a patient who is in a room and was marked seen.
    if (!visit.room_id || !visit.called_at) {
      return NextResponse.json(
        { error: "That patient is not in a room" },
        { status: 409 }
      );
    }
    updates.push(markWaitingUpdate(id));
  } else {
    updates.push(removeUpdate(id, nowMs));
  }

  // The room the patient is leaving may now be empty. (Only unassign and
  // remove leave a room: assign is refused for a patient who has one.)
  const leftRoomId =
    input.action === "unassign" || input.action === "remove"
      ? visit.room_id
      : null;
  if (leftRoomId) {
    const leftRoom = await loadRoom(leftRoomId);
    if (leftRoom) {
      const after = applyVisitUpdates(visits, updates).filter(
        (v) => v.done_at === null
      );
      updates.push(...promotionUpdates(leftRoom, after, nowMs));
    }
  }

  try {
    const result = await commitFlow(supabase, {
      updates,
      visitsBefore: visits,
      nowMs,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
