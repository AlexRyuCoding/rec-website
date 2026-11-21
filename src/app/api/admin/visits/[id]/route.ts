import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { commitFlow } from "@/lib/flow-server";
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
import { loadActiveVisits, VisitDbRow } from "@/lib/visits-server";

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
  const visit = visits.find((v) => v.id === id);
  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const loadRoom = async (roomId: string): Promise<RoomRow | null> => {
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    return (data as RoomRow | null) ?? null;
  };

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
    updates.push(...result.updates);
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
