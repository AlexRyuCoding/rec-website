import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { commitFlow } from "@/lib/flow-server";
import {
  applyVisitUpdates,
  assignUpdate,
  promotionUpdates,
  removeUpdate,
  unassignUpdate,
  VisitUpdate,
} from "@/lib/patient-flow";
import type { RoomRow } from "@/lib/room-status";
import { loadActiveVisits, VisitDbRow } from "@/lib/visits-server";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), roomId: z.string().uuid() }),
  z.object({ action: z.literal("unassign") }),
  z.object({ action: z.literal("remove") }),
]);

// Staff move a checked-in patient through the flow:
// - assign:   send to a room (called now if a bed is free, otherwise lined
//             up and called automatically when the room is ready)
// - unassign: back to the waiting list
// - remove:   finished / no-show / handled another way
// Whatever the action, if it frees a bed in the room the patient leaves,
// the people lined up for that room are called.
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
    const result = assignUpdate(room, visits, id, nowMs);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    updates.push(...result.updates);
  } else if (input.action === "unassign") {
    updates.push(unassignUpdate(id));
  } else {
    updates.push(removeUpdate(id, nowMs));
  }

  // The room the patient is leaving may now have a free bed.
  const leftRoomId =
    visit.room_id &&
    !(input.action === "assign" && input.roomId === visit.room_id)
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
