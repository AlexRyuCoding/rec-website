import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import {
  timerActionUpdate,
  ADJUST_STEP_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RoomRow,
} from "@/lib/room-status";

const bodySchema = z.object({
  action: z.enum([
    "start",
    "pause",
    "resume",
    "reset",
    "adjust",
    "set",
    "clear",
  ]),
  deltaSeconds: z
    .literal(ADJUST_STEP_SECONDS)
    .or(z.literal(-ADJUST_STEP_SECONDS))
    .optional(),
  // "set": absolute seconds typed by staff (new default, or new remaining
  // on an active session)
  setSeconds: z
    .number()
    .int()
    .min(MIN_DURATION_SECONDS)
    .max(MAX_DURATION_SECONDS)
    .optional(),
});

// All timer state changes go through here: read the row, compute the new
// timer_* fields with the same pure logic clients use for display, write,
// broadcast. Last write wins if two devices act at once — both converge on
// the next refetch.
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

  const supabase = createServiceClient();
  const { data: room, error: readError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const result = timerActionUpdate(
    room as RoomRow,
    parsed.data.action,
    Date.now(),
    parsed.data.action === "set"
      ? parsed.data.setSeconds
      : parsed.data.deltaSeconds
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("rooms")
    .update({ ...result.fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await broadcastRoomsUpdated();
  return NextResponse.json({ room: data });
}
