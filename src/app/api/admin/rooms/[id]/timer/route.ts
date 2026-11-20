import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { commitFlow } from "@/lib/flow-server";
import { timerFlowUpdates, VisitView } from "@/lib/patient-flow";
import { loadActiveVisits } from "@/lib/visits-server";
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
    "ready",
  ]),
  // "adjust": the client debounces rapid +/- taps and sends the summed
  // delta, so any non-zero multiple of the step within the duration range
  // is valid; timerActionUpdate still clamps and rejects impossible values.
  deltaSeconds: z
    .number()
    .int()
    .multipleOf(ADJUST_STEP_SECONDS)
    .min(-MAX_DURATION_SECONDS)
    .max(MAX_DURATION_SECONDS)
    .refine((v) => v !== 0)
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
//
// Three actions also move the patients in the room (see patient-flow.ts):
// start = the doctor is in, ready = the room is empty so its patients are
// finished and whoever is lined up gets called, reset = the timer was a
// mistake and the patient is waiting again. That part is best effort: a
// timer action never fails because the patient bookkeeping did.
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

  const nowMs = Date.now();
  const result = timerActionUpdate(
    room as RoomRow,
    parsed.data.action,
    nowMs,
    parsed.data.action === "set"
      ? parsed.data.setSeconds
      : parsed.data.deltaSeconds
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const writeRoom = (fields: Partial<RoomRow>) =>
    supabase
      .from("rooms")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

  let { data, error } = await writeRoom(result.fields);
  // The check button now also stamps turnover_started_at (migration
  // 0011). If that column is not there yet, the alarm must still be
  // silenceable: fall back to the plain clear the board always had.
  if (error && "turnover_started_at" in result.fields) {
    const { turnover_started_at: _turnover, ...timerOnly } = result.fields;
    void _turnover;
    ({ data, error } = await writeRoom(timerOnly));
  }

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await broadcastRoomsUpdated({ room: data });

  let latestRoom = data as RoomRow;
  let visits: VisitView[] | undefined;
  try {
    const before = await loadActiveVisits(supabase, nowMs);
    const updates = timerFlowUpdates(
      parsed.data.action,
      latestRoom,
      before,
      nowMs
    );
    if (updates.length > 0) {
      const flow = await commitFlow(supabase, {
        updates,
        visitsBefore: before,
        nowMs,
      });
      visits = flow.visits;
      // Calling the next patient may have switched this room's doctor.
      latestRoom = flow.rooms.find((r) => r.id === id) ?? latestRoom;
    }
  } catch {
    // The timer change stands; boards reconcile visits on their next poll.
  }

  return NextResponse.json({ room: latestRoom, visits });
}
