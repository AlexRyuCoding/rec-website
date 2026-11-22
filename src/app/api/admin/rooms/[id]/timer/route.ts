import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { commitRoomFlow } from "@/lib/flow-server";
import { timerFlowUpdates, VisitUpdate } from "@/lib/patient-flow";
import { loadActiveVisits, VisitDbRow } from "@/lib/visits-server";
import {
  timerActionUpdate,
  ADJUST_STEP_SECONDS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RoomRow,
} from "@/lib/room-status";
import { staffRoute } from "@/lib/staff-route";

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
    "again",
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
// Some actions also move the patients in the room (see patient-flow.ts):
// start = the doctor is in; ready = the room is empty, so its patients
// are finished and whoever is lined up gets called; reset = the timer was
// a mistake (the patients stay); again = another session for the people
// already in the room — nobody is finished and nobody is called. The
// room and its patients are written together (commitRoomFlow): such an
// action happens whole or not at all.

// The timer actions that can move patients.
const FLOW_ACTIONS: ReadonlySet<string> = new Set([
  "start",
  "again",
  "ready",
  "reset",
]);

export const POST = staffRoute<{ id: string }>(
  async (req, _staff, { params }) => {
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

    // Start, Another session, Room ready and Reset can move the room's
    // patients as well. What they do to them is worked out first, and
    // then the room and its patients are written as ONE change: a room
    // must never be "ready" with its patients still in it, or a couple
    // half finished. If who is in the room cannot be read, the action is
    // refused rather than applied to the timer alone.
    //
    // The other actions — pause, resume, +/-, typing a time, and ✓, which
    // is what silences the alarm — touch only the timer and do not wait
    // on anything about patients.
    const roomBefore = room as RoomRow;
    let visitsBefore: VisitDbRow[] = [];
    let updates: VisitUpdate[] = [];
    if (FLOW_ACTIONS.has(parsed.data.action)) {
      try {
        visitsBefore = await loadActiveVisits(supabase, nowMs);
      } catch {
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
      updates = timerFlowUpdates(
        parsed.data.action,
        { ...roomBefore, ...result.fields },
        visitsBefore,
        nowMs,
        // Start sent while the room was setting up (an older board)
        { wasTurningOver: Boolean(roomBefore.turnover_started_at) }
      );
    }

    if (updates.length > 0) {
      let flow;
      try {
        flow = await commitRoomFlow(supabase, {
          room: { id, fields: result.fields },
          updates,
          visitsBefore,
          nowMs,
        });
      } catch {
        // Written, but the fresh list could not be read back: the boards
        // have been told to refetch and will show it.
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
      if (!flow) {
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }
      return NextResponse.json({ room: flow.room, visits: flow.visits });
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
    await broadcastRoomsUpdated({ room: data });
    return NextResponse.json({ room: data as RoomRow });
  }
);
