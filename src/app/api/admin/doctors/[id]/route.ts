import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { broadcastRoomsUpdated } from "@/lib/rooms-realtime";

// Removing a doctor from the roster also un-assigns them from any rooms —
// assignment is stored denormalized as rooms.doctor_name.
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
    .from("doctors")
    .delete()
    .eq("id", id)
    .select("name")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const { error: clearError } = await supabase
    .from("rooms")
    .update({ doctor_name: null, updated_at: new Date().toISOString() })
    .eq("doctor_name", data.name);
  if (clearError) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Empty payload = "something changed, refetch" on other devices.
  await broadcastRoomsUpdated();
  return NextResponse.json({ success: true });
}
