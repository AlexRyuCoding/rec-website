import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignCollision,
  doctorForCalls,
  promotionUpdates,
  unassignUpdate,
  VisitUpdate,
  VisitView,
} from "./patient-flow";
import type { RoomRow } from "./room-status";
import { broadcastFlowUpdated, broadcastRoomsUpdated } from "./rooms-realtime";
import {
  loadActiveVisits,
  toVisitView,
  VisitDbRow,
  writeVisitUpdates,
} from "./visits-server";

interface FlowArgs {
  updates: VisitUpdate[];
  // The visit list the updates were computed from; it supplies each
  // called patient's room and Practice Better doctor.
  visitsBefore: VisitDbRow[];
  nowMs: number;
}

export interface FlowResult {
  visits: VisitView[];
  rooms: RoomRow[];
}

// The one place a flow change is applied end to end: write the visit
// updates, switch the doctor pill of any room a patient was just called
// to, tell every open board to refetch, and hand back the fresh state.
//
// Throws if a write was refused. Some of the updates may have gone
// through by then, so the boards are still told to refetch first: what
// they show must be what the database holds, and the board that asked
// gets an error instead of a silent "nothing happened".
export async function commitFlow(
  supabase: SupabaseClient,
  args: FlowArgs
): Promise<FlowResult> {
  const written = await writeVisitUpdates(supabase, args.updates);
  if (!written) {
    await broadcastFlowUpdated();
    throw new Error("visit write failed");
  }
  return finishFlow(supabase, args);
}

// Everything after the writes: doctor pills, the refetch hint, and the
// fresh list.
async function finishFlow(
  supabase: SupabaseClient,
  args: FlowArgs
): Promise<FlowResult> {
  const { updates, visitsBefore, nowMs } = args;
  const rooms = await applyDoctorPills(supabase, updates, visitsBefore);

  // Empty hint only — patient data never goes on the broadcast channel.
  await broadcastFlowUpdated();

  const visits = (await loadActiveVisits(supabase, nowMs)).map(toVisitView);
  return { visits, rooms };
}

export type AssignResult =
  | ({ ok: true } & FlowResult)
  // taken: the patient got a room (or was finished) on another board
  //   between this request's read and its write.
  // collision: another patient reached the same room at the same instant
  //   (see assignCollision); this assign was taken back.
  | { ok: false; reason: "taken" | "collision" | "error" };

// Applies one assign (the update assignUpdate produced) so that two
// boards acting at the same instant cannot put strangers in a room:
//
// 1. The write only lands if the patient still has no room.
// 2. The visits are read again. If the patient is now beside anyone the
//    request did not name, the write is undone — before any board is
//    told to refetch — and the request is refused.
// 3. A room that emptied in the meantime calls its line (the promotion
//    rule), so a patient lined up at that very moment is not left
//    "next up" for a room that is free.
//
// If the check itself cannot be made, the assign is undone: not knowing
// who is in the room is not a reason to leave someone in it.
export async function commitAssign(
  supabase: SupabaseClient,
  args: {
    room: RoomRow;
    update: VisitUpdate;
    togetherWith: string[];
    visitsBefore: VisitDbRow[];
    nowMs: number;
  }
): Promise<AssignResult> {
  const { room, update, togetherWith, visitsBefore, nowMs } = args;

  const { data: landed, error: writeError } = await supabase
    .from("checkins")
    .update(update.fields)
    .eq("id", update.id)
    .is("room_id", null)
    .is("done_at", null)
    .select("id");
  if (writeError) return { ok: false, reason: "error" };
  if (!landed || landed.length === 0) return { ok: false, reason: "taken" };

  const undo = async () => {
    try {
      await supabase
        .from("checkins")
        .update(unassignUpdate(update.id).fields)
        .eq("id", update.id)
        .eq("room_id", room.id);
    } catch {
      // Nothing more can be done from here; the boards refetch below.
    }
    await broadcastFlowUpdated();
  };

  let after: VisitDbRow[];
  try {
    after = await loadActiveVisits(supabase, nowMs);
  } catch {
    await undo();
    return { ok: false, reason: "error" };
  }
  if (assignCollision(room.id, after, update.id, togetherWith)) {
    await undo();
    return { ok: false, reason: "collision" };
  }

  // The room as it is now, not as it was when the request was read.
  const updates = [update];
  try {
    const { data: roomNow } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", room.id)
      .maybeSingle();
    if (roomNow) {
      const promotions = promotionUpdates(roomNow as RoomRow, after, nowMs);
      if (promotions.length > 0) {
        await writeVisitUpdates(supabase, promotions);
        updates.push(...promotions);
      }
    }
  } catch {
    // The assign itself stands; the next change to the room promotes.
  }

  try {
    return {
      ok: true,
      ...(await finishFlow(supabase, { updates, visitsBefore, nowMs })),
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// A patient being called to a room brings their doctor with them: the
// room's pill switches to the roster doctor matching the appointment's
// practitioner. No match (or no appointment) leaves the pill alone.
async function applyDoctorPills(
  supabase: SupabaseClient,
  updates: VisitUpdate[],
  visitsBefore: VisitDbRow[]
): Promise<RoomRow[]> {
  // Group the calls by the room each patient is being called to.
  const callsByRoom = new Map<string, VisitUpdate[]>();
  for (const update of updates) {
    if (!update.fields.called_at) continue;
    const roomId =
      update.fields.room_id ??
      visitsBefore.find((v) => v.id === update.id)?.room_id;
    if (!roomId) continue;
    callsByRoom.set(roomId, [...(callsByRoom.get(roomId) ?? []), update]);
  }
  if (callsByRoom.size === 0) return [];

  const changed: RoomRow[] = [];
  try {
    const { data: roster } = await supabase.from("doctors").select("name");
    if (!roster || roster.length === 0) return [];

    for (const [roomId, calls] of callsByRoom) {
      const doctor = doctorForCalls(calls, visitsBefore, roster);
      if (!doctor) continue;
      const { data: current } = await supabase
        .from("rooms")
        .select("doctor_name")
        .eq("id", roomId)
        .maybeSingle();
      if (!current || current.doctor_name === doctor) continue;
      const { data } = await supabase
        .from("rooms")
        .update({ doctor_name: doctor, updated_at: new Date().toISOString() })
        .eq("id", roomId)
        .select("*")
        .maybeSingle();
      const updated = data as RoomRow | null;
      if (updated) {
        changed.push(updated);
        await broadcastRoomsUpdated({ room: updated });
      }
    }
  } catch {
    // The pill is a convenience; the call itself already went through.
  }
  return changed;
}
