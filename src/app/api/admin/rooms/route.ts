import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { GRID_COLS } from "@/lib/room-status";

// Room timer board data. GET returns every room, the doctor roster, and
// the server clock so devices with skewed clocks still render identical
// countdowns. Riding the roster on this response means the existing 60 s
// poll and focus refresh keep it synced across devices.
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const [roomsResult, doctorsResult] = await Promise.all([
    supabase.from("rooms").select("*").order("grid_row").order("grid_col"),
    supabase.from("doctors").select("*").order("created_at"),
  ]);

  if (roomsResult.error || doctorsResult.error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({
    rooms: roomsResult.data ?? [],
    doctors: doctorsResult.data ?? [],
    serverTime: new Date().toISOString(),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gridRow: z.number().int().min(0).max(49),
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLS - 1),
});

export async function POST(req: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}
