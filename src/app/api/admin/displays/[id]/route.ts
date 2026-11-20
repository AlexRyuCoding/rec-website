import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { isAdminAuthorized } from "@/lib/admin-auth";

// Revoke a paired waiting-room screen. Its cookie stops working at once;
// the TV falls back to showing a fresh pairing code.
export async function DELETE(
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
  const { data, error } = await supabase
    .from("display_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
