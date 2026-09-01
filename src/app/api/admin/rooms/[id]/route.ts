import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import {
  DOCTOR_NAME_MAX_LENGTH,
  GRID_COLS,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
} from "@/lib/room-status";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  gridRow: z.number().int().min(0).max(49).optional(),
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLS - 1)
    .optional(),
  doctorName: z
    .string()
    .trim()
    .min(1)
    .max(DOCTOR_NAME_MAX_LENGTH)
    .nullable()
    .optional(),
  defaultDurationSeconds: z
    .number()
    .int()
    .min(MIN_DURATION_SECONDS)
    .max(MAX_DURATION_SECONDS)
    .optional(),
});

// Edit-layout metadata updates. Timer actions live in ./timer — this route
// never touches the timer_* columns.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) fields.name = d.name;
  if (d.gridRow !== undefined) fields.grid_row = d.gridRow;
  if (d.gridCol !== undefined) fields.grid_col = d.gridCol;
  if (d.doctorName !== undefined) fields.doctor_name = d.doctorName;
  if (d.defaultDurationSeconds !== undefined) {
    fields.default_duration_seconds = d.defaultDurationSeconds;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  fields.updated_at = new Date().toISOString();

  const supabase = createServiceClient();

  // Assignment must come from the managed roster (or null to unassign).
  if (typeof d.doctorName === "string") {
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id")
      .eq("name", d.doctorName)
      .maybeSingle();
    if (doctorError) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    if (!doctor) {
      return NextResponse.json(
        { error: "That doctor is not on the list" },
        { status: 400 }
      );
    }
  }
  const { data, error } = await supabase
    .from("rooms")
    .update(fields)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That cell is already occupied" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await broadcastRoomsUpdated({ room: data });
  return NextResponse.json({ room: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await broadcastRoomsUpdated({ deletedId: id });
  return NextResponse.json({ success: true });
}
