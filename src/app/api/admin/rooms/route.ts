import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { GRID_COLS } from "@/lib/room-status";
import { VisitView } from "@/lib/patient-flow";
import { loadActiveVisits, toVisitViews } from "@/lib/visits-server";
import { staffRoute } from "@/lib/staff-route";

// Room timer board data. GET returns every room, the doctor roster, and
// the server clock so devices with skewed clocks still render identical
// countdowns. Riding the roster on this response means the existing 60 s
// poll and focus refresh keep it synced across devices. The open visits
// (waiting list + who is in which room) ride along for the same reason.
export const GET = staffRoute(async () => {
  const supabase = createServiceClient();
  const [roomsResult, doctorsResult] = await Promise.all([
    supabase.from("rooms").select("*").order("grid_row").order("grid_col"),
    supabase.from("doctors").select("*").order("created_at"),
  ]);

  if (roomsResult.error || doctorsResult.error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // If the patients cannot be read the board is told so (it then keeps
  // what it was showing and says "Reconnecting…"). Answering with an
  // empty list instead would wipe every patient off every tile, and an
  // occupied room would look free.
  let visits: VisitView[];
  try {
    const nowMs = Date.now();
    visits = await toVisitViews(
      supabase,
      await loadActiveVisits(supabase, nowMs),
      nowMs
    );
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({
    rooms: roomsResult.data ?? [],
    doctors: doctorsResult.data ?? [],
    visits,
    serverTime: new Date().toISOString(),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gridRow: z.number().int().min(0).max(49),
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLS - 1),
});

export const POST = staffRoute(async (req) => {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name: parsed.data.name,
      grid_row: parsed.data.gridRow,
      grid_col: parsed.data.gridCol,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That cell is already occupied" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await broadcastRoomsUpdated({ room: data });
  return NextResponse.json({ room: data }, { status: 201 });
});
