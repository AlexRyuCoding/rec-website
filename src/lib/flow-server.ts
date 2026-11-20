import type { SupabaseClient } from "@supabase/supabase-js";
import { doctorForCalls, VisitUpdate, VisitView } from "./patient-flow";
import type { RoomRow } from "./room-status";
import { broadcastFlowUpdated, broadcastRoomsUpdated } from "./rooms-realtime";
import {
  loadActiveVisits,
  toVisitView,
  VisitDbRow,
  writeVisitUpdates,
} from "./visits-server";

// The one place a flow change is applied end to end: write the visit
// updates, switch the doctor pill of any room a patient was just called
// to, tell every open board to refetch, and hand back the fresh state.
//
// visitsBefore is the visit list the updates were computed from; it
// supplies each called patient's room and Practice Better doctor.
export async function commitFlow(
  supabase: SupabaseClient,
  args: { updates: VisitUpdate[]; visitsBefore: VisitDbRow[]; nowMs: number }
): Promise<{ visits: VisitView[]; rooms: RoomRow[] }> {
  const { updates, visitsBefore, nowMs } = args;
  await writeVisitUpdates(supabase, updates);

  const rooms = await applyDoctorPills(supabase, updates, visitsBefore);

  // Empty hint only — patient data never goes on the broadcast channel.
  await broadcastFlowUpdated();

  const visits = (await loadActiveVisits(supabase, nowMs)).map(toVisitView);
  return { visits, rooms };
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
