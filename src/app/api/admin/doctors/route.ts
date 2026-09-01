import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";
import { DOCTOR_NAME_MAX_LENGTH, MAX_DOCTORS } from "@/lib/room-status";

// Doctor roster mutations. The roster itself is read via GET
// /api/admin/rooms so one poll keeps rooms and doctors in sync everywhere.

const createSchema = z.object({
  name: z.string().trim().min(1).max(DOCTOR_NAME_MAX_LENGTH),
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
  const { data: existing, error: listError } = await supabase
    .from("doctors")
    .select("name");
  if (listError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if ((existing ?? []).length >= MAX_DOCTORS) {
    return NextResponse.json(
      { error: `The list is full (max ${MAX_DOCTORS} doctors)` },
      { status: 409 }
    );
  }
  const name = parsed.data.name;
  if (
    (existing ?? []).some((d) => d.name.toLowerCase() === name.toLowerCase())
  ) {
    return NextResponse.json(
      { error: "That doctor is already on the list" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("doctors")
    .insert({ name })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Empty payload = "something changed, refetch" on other devices.
  await broadcastRoomsUpdated();
  return NextResponse.json({ doctor: data }, { status: 201 });
}
