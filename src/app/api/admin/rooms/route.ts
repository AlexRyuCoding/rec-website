import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { GRID_COLS } from "@/lib/room-status";

// Room timer board data. GET returns every room plus the server clock so
// devices with skewed clocks still render identical countdowns.
export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("grid_row")
    .order("grid_col");

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  return NextResponse.json({
    rooms: data ?? [],
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
  practitionerName: z.string().trim().max(60).optional(),
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
      practitioner_name: parsed.data.practitionerName || null,
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

  await broadcastRoomsUpdated();
  return NextResponse.json({ room: data }, { status: 201 });
}
