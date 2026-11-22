import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { commitFlow } from "@/lib/flow-server";
import { doctorInUpdates } from "@/lib/patient-flow";
import {
  loadActiveVisits,
  toVisitViews,
  VisitDbRow,
} from "@/lib/visits-server";

// "Doctor in": the doctor has walked into the room. Every patient waiting
// there is marked seen, which ends the board's "patient waiting" alert,
// takes the patient's name off the waiting-room screen and turns the tile
// to "With doctor". The timer is untouched — it starts later, once the
// needles are in.
//
// Tapping it twice (two boards, or a slow connection) is harmless: the
// second call finds nobody waiting and changes nothing.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const nowMs = Date.now();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (roomError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  let visits: VisitDbRow[];
  try {
    visits = await loadActiveVisits(supabase, nowMs);
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const updates = doctorInUpdates(id, visits, nowMs);
  if (updates.length === 0) {
    return NextResponse.json({
      visits: await toVisitViews(supabase, visits, nowMs),
      rooms: [],
    });
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
